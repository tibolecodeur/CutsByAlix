import { adminClient, toAdminError } from "@/features/admin/data";

/**
 * Notifications push de l'espace admin (ADR 0012), côté navigateur.
 *
 * Sur iPhone, le push n'existe que depuis iOS 16.4, et seulement pour un site AJOUTÉ À L'ÉCRAN
 * D'ACCUEIL et ouvert depuis son icône : dans un onglet Safari, `PushManager` n'existe pas.
 * D'où l'état « needs_install », qui explique la marche à suivre.
 *
 * Chaque appareil abonné est enregistré en base (RPC `admin_save_push_subscription`) ; l'envoi
 * est fait par l'Edge Function notify-booking, déclenchée par la base à chaque réservation.
 */

export type PushStatus =
  /** iPhone / iPad dans Safari : il faut d'abord ajouter l'admin à l'écran d'accueil. */
  | "needs_install"
  /** Navigateur sans notifications (ou iOS < 16.4). */
  | "unsupported"
  /** Clé publique VAPID absente du build : le site n'est pas encore configuré. */
  | "not_configured"
  /** Notifications refusées pour ce site (à réactiver dans les réglages du téléphone). */
  | "denied"
  | "off"
  | "on";

export type PushErrorCode = "denied" | "unsupported" | "unknown";

export class PushError extends Error {
  readonly code: PushErrorCode;

  constructor(code: PushErrorCode) {
    super(code);
    this.name = "PushError";
    this.code = code;
  }
}

/** Le service worker et sa portée : tout l'espace admin, rien d'autre. */
export const SERVICE_WORKER_URL = "/admin-sw.js";
export const SERVICE_WORKER_SCOPE = "/admin";

/** Ce qu'on lit du navigateur, rassemblé pour pouvoir le simuler en test. */
export type PushEnvironment = {
  userAgent: string;
  maxTouchPoints: number;
  /** Ouvert depuis l'icône de l'écran d'accueil (mode « application »). */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
};

export function readPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone:
      nav.standalone === true ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(display-mode: standalone)").matches),
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
  };
}

/** iPhone, iPod, iPad (un iPad récent se présente comme un Mac tactile). */
export function isAppleMobile(env: Pick<PushEnvironment, "userAgent" | "maxTouchPoints">): boolean {
  return (
    /iPhone|iPad|iPod/.test(env.userAgent) ||
    (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1)
  );
}

/** Le navigateur sait-il faire du push ? Sinon, pourquoi (avant toute demande d'autorisation). */
export function pushSupport(env: PushEnvironment): "supported" | "needs_install" | "unsupported" {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return "supported";
  if (isAppleMobile(env) && !env.standalone) return "needs_install";
  return "unsupported";
}

export function vapidPublicKey(): string {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
}

/** Clé publique VAPID (base64url) → octets, format attendu par `pushManager.subscribe`. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** État affiché par la carte « Notifications ». Ne demande JAMAIS l'autorisation. */
export async function getPushStatus(env = readPushEnvironment()): Promise<PushStatus> {
  const support = pushSupport(env);
  if (support !== "supported") return support;
  if (!vapidPublicKey()) return "not_configured";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

/** Lit les clés de l'abonnement (format JSON du navigateur : base64url). */
function subscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new PushError("unknown");
  return { endpoint: json.endpoint, p256dh, auth };
}

/**
 * Active les notifications sur cet appareil. À appeler DIRECTEMENT dans le gestionnaire du
 * toucher : iOS n'affiche la demande d'autorisation qu'en réponse à un geste. C'est pourquoi
 * `requestPermission` est la toute première instruction (aucun `await` avant).
 */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new PushError("denied");
  const key = vapidPublicKey();
  if (!key) throw new PushError("unsupported");

  let subscription: PushSubscription;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
    const registration = await navigator.serviceWorker.ready;
    subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(key),
      }));
  } catch {
    throw new PushError("unknown");
  }

  const { endpoint, p256dh, auth } = subscriptionKeys(subscription);
  const { error } = await adminClient().rpc("admin_save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  });
  if (error) {
    // Pas enregistré en base : on ne laisse pas un abonnement « fantôme » sur l'appareil.
    await subscription.unsubscribe().catch(() => false);
    throw toAdminError(error);
  }
}

/** Désactive les notifications sur cet appareil (en base, puis dans le navigateur). */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const { error } = await adminClient().rpc("admin_delete_push_subscription", {
    p_endpoint: subscription.endpoint,
  });
  if (error) throw toAdminError(error);
  await subscription.unsubscribe().catch(() => false);
}

export type TestPushResult = "queued" | "no_device" | "not_configured";

/** Demande à la base d'envoyer une notification de test à tous les appareils d'Alix. */
export async function sendTestPush(): Promise<TestPushResult> {
  const { data, error } = await adminClient().rpc("admin_send_test_push");
  if (error) throw toAdminError(error);
  return data;
}

/**
 * Coupe les notifications sur TOUS les appareils de l'admin (téléphone perdu, doute), puis se
 * désabonne aussi dans ce navigateur. Renvoie le nombre d'appareils oubliés en base.
 */
export async function disablePushEverywhere(): Promise<number> {
  const { data, error } = await adminClient().rpc("admin_delete_push_subscriptions", {
    p_keep_endpoint: null,
  });
  if (error) throw toAdminError(error);
  const subscription = await currentSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
  return data;
}

/** Au-delà, on n'attend plus : une déconnexion ne doit jamais rester bloquée par le réseau. */
const BEST_EFFORT_TIMEOUT_MS = 3000;

function bestEffort(task: () => Promise<unknown>): Promise<void> {
  return Promise.race([
    task().then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, BEST_EFFORT_TIMEOUT_MS)),
  ]);
}

/**
 * Avant la déconnexion : ce téléphone ne doit plus recevoir les prénoms des clients. Sans
 * erreur ni attente de plus de 3 s (hors ligne, la déconnexion se fait quand même).
 */
export function forgetThisPushDevice(): Promise<void> {
  return bestEffort(disablePush);
}

/**
 * Après un changement de mot de passe (« les autres appareils sont déconnectés ») : les autres
 * appareils ne reçoivent plus de notifications ; celui-ci les garde s'il est abonné.
 */
export function forgetOtherPushDevices(): Promise<void> {
  return bestEffort(async () => {
    const subscription = await currentSubscription().catch(() => null);
    const { error } = await adminClient().rpc("admin_delete_push_subscriptions", {
      p_keep_endpoint: subscription?.endpoint ?? null,
    });
    if (error) throw toAdminError(error);
  });
}
