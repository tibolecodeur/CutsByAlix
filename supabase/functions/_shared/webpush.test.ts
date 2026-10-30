import { describe, expect, it, vi } from "vitest";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  encryptPayload,
  isValidEndpoint,
  sendPush,
  vapidAuthorization,
  type VapidKeys,
} from "./webpush";

/** Vecteur de test de la RFC 8291 (annexe A) : clés, sel et résultat attendu. */
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  clientPublicKey:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  clientPrivateKey: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  serverPrivateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  serverPublicKey:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAm" +
    "S6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Q" +
    "ulcy4a-fN",
};

const SUBSCRIPTION = {
  endpoint: "https://web.push.apple.com/abonnement/123",
  p256dh: RFC.clientPublicKey,
  auth: RFC.authSecret,
};

/** Paire de clés VAPID fraîche, au format de `web-push generate-vapid-keys`. */
async function newVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    publicKey: bytesToBase64Url(raw),
    privateKey: jwk.d!,
    subject: "mailto:contact@example.test",
  };
}

describe("encryptPayload (RFC 8291)", () => {
  it("donne exactement le corps du vecteur de test de la RFC", async () => {
    const body = await encryptPayload(SUBSCRIPTION, RFC.plaintext, {
      serverPrivateKey: base64UrlToBytes(RFC.serverPrivateKey),
      serverPublicKey: base64UrlToBytes(RFC.serverPublicKey),
      salt: base64UrlToBytes(RFC.salt),
    });
    expect(bytesToBase64Url(body)).toBe(RFC.body);
  });

  it("chaque envoi tire une clé et un sel neufs : deux corps différents pour le même texte", async () => {
    const first = await encryptPayload(SUBSCRIPTION, "Bonjour");
    const second = await encryptPayload(SUBSCRIPTION, "Bonjour");
    expect(bytesToBase64Url(first)).not.toBe(bytesToBase64Url(second));
    // En-tête : sel (16) + taille d'enregistrement (4) + longueur de clé (1) + clé (65).
    expect(new DataView(first.buffer).getUint32(16)).toBe(4096);
    expect(first[20]).toBe(65);
  });

  it("refuse un message trop long pour un enregistrement", async () => {
    await expect(encryptPayload(SUBSCRIPTION, "x".repeat(5000))).rejects.toThrow(
      "payload_too_large",
    );
  });

  it("refuse une clé d'appareil invalide", async () => {
    await expect(encryptPayload({ ...SUBSCRIPTION, p256dh: "AAAA" }, "Bonjour")).rejects.toThrow();
  });
});

describe("vapidAuthorization (RFC 8292)", () => {
  it("JWT ES256 signé, pour l'origine de l'endpoint, valable 12 h, vérifiable avec la clé publique", async () => {
    const vapid = await newVapidKeys();
    const header = await vapidAuthorization("https://web.push.apple.com/abc?x=1", vapid, 1_000_000);

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, key] = match!;
    expect(key).toBe(vapid.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64UrlToBytes(head!)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    expect(JSON.parse(new TextDecoder().decode(base64UrlToBytes(claims!)))).toEqual({
      aud: "https://web.push.apple.com",
      exp: 1_000_000 + 12 * 3600,
      sub: "mailto:contact@example.test",
    });

    const publicKey = await crypto.subtle.importKey(
      "raw",
      base64UrlToBytes(vapid.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      base64UrlToBytes(signature!),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe("sendPush", () => {
  it("POST chiffré vers l'endpoint, avec les en-têtes attendus", async () => {
    const vapid = await newVapidKeys();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }));
    const result = await sendPush(SUBSCRIPTION, "Bonjour", vapid, {
      ttlSeconds: 3600,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ status: 201, gone: false });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SUBSCRIPTION.endpoint);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("3600");
    expect(headers.Urgency).toBe("high");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
  });

  it.each([404, 410])("%i : l'abonnement est signalé comme disparu", async (status) => {
    const vapid = await newVapidKeys();
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    const result = await sendPush(SUBSCRIPTION, "Bonjour", vapid, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ status, gone: true });
  });

  it("endpoint hors des services de push : aucun appel réseau, abonnement à oublier", async () => {
    const vapid = await newVapidKeys();
    const fetchImpl = vi.fn();
    const result = await sendPush(
      { ...SUBSCRIPTION, endpoint: "http://exemple.test" },
      "x",
      vapid,
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );
    expect(result).toEqual({ status: 0, gone: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("isValidEndpoint", () => {
  it("https et services de push connus seulement", () => {
    expect(isValidEndpoint("https://web.push.apple.com/x")).toBe(true);
    expect(isValidEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isValidEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isValidEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isValidEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isValidEndpoint("https://web.push.apple.com:8443/x")).toBe(false);
    expect(isValidEndpoint("https://web.push.apple.com.pirate.test/x")).toBe(false);
    expect(isValidEndpoint("https://10.0.0.1/x")).toBe(false);
    expect(isValidEndpoint("https://localhost/x")).toBe(false);
    expect(isValidEndpoint("pas une url")).toBe(false);
  });
});
