/**
 * Envoi d'une notification « web push » (RFC 8030), chiffrée (RFC 8291, aes128gcm) et signée
 * VAPID (RFC 8292), avec la seule API WebCrypto. Aucune dépendance : le même fichier tourne
 * dans l'Edge Function (Deno) et dans Vitest (Node), où il est testé sur le vecteur de la
 * RFC 8291.
 *
 * Le contenu est chiffré pour le seul appareil abonné : le service de push (Apple, Google,
 * Mozilla) transporte un message qu'il ne peut pas lire.
 */

export type PushSubscription = {
  endpoint: string;
  /** Clé publique de l'appareil (P-256, non compressée, base64url). */
  p256dh: string;
  /** Secret d'authentification de l'appareil (16 octets, base64url). */
  auth: string;
};

export type VapidKeys = {
  /** Clé publique (P-256 non compressée, 65 octets, base64url) : celle donnée au navigateur. */
  publicKey: string;
  /** Clé privée (32 octets, base64url). */
  privateKey: string;
  /** Contact de l'expéditeur exigé par les services de push : « mailto:… » ou « https://… ». */
  subject: string;
};

export type PushResult = {
  /** Code HTTP du service de push (201 : accepté). */
  status: number;
  /** 404 / 410 : l'abonnement n'existe plus, il faut l'oublier. */
  gone: boolean;
};

// ----- base64url -------------------------------------------------------------------------------

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const text = (value: string) => new TextEncoder().encode(value);

// ----- clés P-256 ------------------------------------------------------------------------------

/** Clé publique non compressée (0x04 ‖ X ‖ Y, 65 octets) → coordonnées JWK. */
function publicKeyToJwk(publicKey: Uint8Array): { x: string; y: string } {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error("invalid_public_key");
  }
  return {
    x: bytesToBase64Url(publicKey.slice(1, 33)),
    y: bytesToBase64Url(publicKey.slice(33, 65)),
  };
}

function importPrivateKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  algorithm: "ECDH" | "ECDSA",
): Promise<CryptoKey> {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: bytesToBase64Url(privateKey),
    ...publicKeyToJwk(publicKey),
  };
  const usages: KeyUsage[] = algorithm === "ECDH" ? ["deriveBits"] : ["sign"];
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: algorithm, namedCurve: "P-256" },
    false,
    usages,
  );
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  keyMaterial: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", keyMaterial, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ----- chiffrement (RFC 8291) ------------------------------------------------------------------

/** Clé éphémère du serveur et sel : tirés au hasard à chaque envoi, imposés seulement en test. */
export type EncryptionSeed = {
  serverPrivateKey: Uint8Array;
  serverPublicKey: Uint8Array;
  salt: Uint8Array;
};

async function randomSeed(): Promise<EncryptionSeed> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    serverPrivateKey: base64UrlToBytes(jwk.d!),
    serverPublicKey: raw,
    salt: crypto.getRandomValues(new Uint8Array(16)),
  };
}

/** Taille d'enregistrement annoncée : un seul enregistrement, notre message fait < 4 Ko. */
const RECORD_SIZE = 4096;

/**
 * Corps chiffré d'un message push : en-tête (sel ‖ taille ‖ clé publique du serveur) puis le
 * texte chiffré en AES-128-GCM, avec la clé dérivée de l'échange ECDH et du secret `auth`.
 */
export async function encryptPayload(
  subscription: PushSubscription,
  payload: string,
  seed?: EncryptionSeed,
): Promise<Uint8Array<ArrayBuffer>> {
  const { serverPrivateKey, serverPublicKey, salt } = seed ?? (await randomSeed());
  const clientPublicKey = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);

  const serverKey = await importPrivateKey(serverPrivateKey, serverPublicKey, "ECDH");
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKey, 256),
  );

  const keyInfo = concat(text("WebPush: info\0"), clientPublicKey, serverPublicKey);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);
  const saltBytes = new Uint8Array(salt);
  const contentKey = await hkdf(saltBytes, ikm, text("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(saltBytes, ikm, text("Content-Encoding: nonce\0"), 12);

  // Un seul enregistrement : le texte suivi du délimiteur 0x02 (« dernier enregistrement »).
  const plaintext = concat(text(payload), new Uint8Array([2]));
  if (plaintext.length + 16 > RECORD_SIZE) throw new Error("payload_too_large");
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext),
  );

  const header = new Uint8Array(16 + 4 + 1);
  header.set(saltBytes, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = serverPublicKey.length;
  return concat(header, serverPublicKey, ciphertext);
}

// ----- signature VAPID (RFC 8292) ---------------------------------------------------------------

/** Durée de validité de la signature : 12 h (les services refusent au-delà de 24 h). */
const VAPID_TTL_S = 12 * 3600;

/** En-tête `Authorization: vapid t=<JWT signé ES256>, k=<clé publique>` pour l'endpoint. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const publicKey = base64UrlToBytes(vapid.publicKey);
  const key = await importPrivateKey(base64UrlToBytes(vapid.privateKey), publicKey, "ECDSA");
  const header = bytesToBase64Url(text(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(
    text(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: nowSeconds + VAPID_TTL_S,
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto renvoie la signature au format r ‖ s (64 octets) : exactement celui du JWT.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, text(unsigned)),
  );
  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${vapid.publicKey}`;
}

// ----- envoi -----------------------------------------------------------------------------------

/**
 * Services de push connus (Apple, Google, Mozilla, Microsoft) : on n'envoie jamais de requête
 * vers un autre hôte, même si un abonnement en base le demandait. Même liste que
 * private.is_push_endpoint() (migration …_notifications_push.sql).
 */
const PUSH_HOSTS =
  /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/;

export function isValidEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Envoie `payload` à l'appareil abonné. `ttlSeconds` : durée pendant laquelle le service garde
 * le message si le téléphone est éteint. `fetchImpl` : remplaçable en test.
 */
export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  vapid: VapidKeys,
  {
    ttlSeconds = 24 * 3600,
    fetchImpl = fetch,
  }: { ttlSeconds?: number; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  if (!isValidEndpoint(subscription.endpoint)) return { status: 0, gone: true };
  const body = await encryptPayload(subscription, payload);
  const response = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high",
    },
    body,
    // Jamais de redirection suivie : la requête reste sur le service de push vérifié.
    redirect: "manual",
  });
  return { status: response.status, gone: response.status === 404 || response.status === 410 };
}
