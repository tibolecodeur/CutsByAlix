import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/features/admin/data";
import {
  base64UrlToBytes,
  disablePush,
  enablePush,
  getPushStatus,
  isAppleMobile,
  pushSupport,
  readPushEnvironment,
  sendTestPush,
  type PushEnvironment,
} from "@/features/admin/push";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fakeSupabaseClient, type FakeQueryResult } from "@/test/fakeSupabase";

// Les RPC passent par le client admin : simulé, aucune requête ne part.
vi.mock("@/lib/supabaseAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseAdmin")>()),
  getSupabaseAdmin: vi.fn(),
}));

function mockSupabase(result: FakeQueryResult) {
  const fake = fakeSupabaseClient(result);
  vi.mocked(getSupabaseAdmin).mockReturnValue(fake.client);
  return fake.calls;
}

/** Appels faits sur le client simulé, lus au moment de l'assertion. */
const asCalls = (calls: { method: string; args: unknown[] }[]) =>
  calls.map(({ method, args }) => [method, ...args]);

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";

const SUPPORTED: PushEnvironment = {
  userAgent: ANDROID_UA,
  maxTouchPoints: 5,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
};

const VAPID =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

const SUBSCRIPTION_JSON = {
  endpoint: "https://web.push.apple.com/abonnement",
  keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
};

/** Faux navigateur : Notification, service worker et abonnement push. */
function fakeBrowser({
  permission = "default" as NotificationPermission,
  answer = "granted" as NotificationPermission,
  subscribed = false,
} = {}) {
  const subscription = {
    endpoint: SUBSCRIPTION_JSON.endpoint,
    toJSON: () => SUBSCRIPTION_JSON,
    unsubscribe: vi.fn(async () => true),
  };
  let current = subscribed ? subscription : null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = subscription;
      return subscription;
    }),
  };
  const registration = { pushManager };
  const serviceWorker = {
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
    getRegistration: vi.fn(async () => registration),
  };
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = answer;
      return answer;
    }),
  };
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("PushManager", class {});
  Object.defineProperty(navigator, "serviceWorker", { value: serviceWorker, configurable: true });
  return { notification, serviceWorker, pushManager, subscription };
}

beforeEach(() => {
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

describe("pushSupport", () => {
  it("navigateur complet : supporté", () => {
    expect(pushSupport(SUPPORTED)).toBe("supported");
  });

  it("iPhone dans un onglet Safari (pas de PushManager) : à ajouter à l'écran d'accueil", () => {
    expect(pushSupport({ ...SUPPORTED, userAgent: IPHONE_UA, hasPushManager: false })).toBe(
      "needs_install",
    );
  });

  it("iPhone ouvert depuis l'écran d'accueil mais iOS trop ancien : non supporté", () => {
    expect(
      pushSupport({ ...SUPPORTED, userAgent: IPHONE_UA, standalone: true, hasPushManager: false }),
    ).toBe("unsupported");
  });

  it("autre navigateur sans push : non supporté", () => {
    expect(pushSupport({ ...SUPPORTED, hasServiceWorker: false })).toBe("unsupported");
  });
});

describe("isAppleMobile", () => {
  it("iPhone, et iPad qui se présente comme un Mac tactile", () => {
    expect(isAppleMobile({ userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: IPAD_UA, maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobile({ userAgent: IPAD_UA, maxTouchPoints: 0 })).toBe(false);
    expect(isAppleMobile({ userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(false);
  });
});

describe("readPushEnvironment", () => {
  it("lit le navigateur courant (jsdom : ni service worker ni push)", () => {
    const env = readPushEnvironment();
    expect(env.hasServiceWorker).toBe(false);
    expect(env.hasPushManager).toBe(false);
    expect(env.standalone).toBe(false);
  });
});

describe("base64UrlToBytes", () => {
  it("décode le base64url sans remplissage (clé VAPID de 65 octets)", () => {
    const bytes = base64UrlToBytes(VAPID);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});

describe("getPushStatus", () => {
  it("non supporté ou à installer : renvoyé tel quel, sans rien demander", async () => {
    const { notification } = fakeBrowser();
    expect(await getPushStatus({ ...SUPPORTED, userAgent: IPHONE_UA, hasPushManager: false })).toBe(
      "needs_install",
    );
    expect(notification.requestPermission).not.toHaveBeenCalled();
  });

  it("clé VAPID absente du build : not_configured", async () => {
    fakeBrowser();
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
    expect(await getPushStatus(SUPPORTED)).toBe("not_configured");
  });

  it.each([
    ["denied", false, "denied"],
    ["default", false, "off"],
    ["granted", false, "off"],
    ["granted", true, "on"],
  ] as const)("autorisation %s, abonné : %s → %s", async (permission, subscribed, expected) => {
    fakeBrowser({ permission, subscribed });
    expect(await getPushStatus(SUPPORTED)).toBe(expected);
  });
});

describe("enablePush", () => {
  it("demande l'autorisation, enregistre le service worker, s'abonne puis enregistre en base", async () => {
    const calls = mockSupabase({ data: null, error: null });
    const { notification, serviceWorker, pushManager } = fakeBrowser();

    await enablePush();

    expect(notification.requestPermission).toHaveBeenCalledOnce();
    expect(serviceWorker.register).toHaveBeenCalledWith("/admin-sw.js", { scope: "/admin" });
    const options = (
      pushManager.subscribe.mock.calls[0] as unknown[]
    )[0] as PushSubscriptionOptionsInit;
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toEqual(base64UrlToBytes(VAPID));
    expect(asCalls(calls)).toEqual([
      [
        "rpc",
        "admin_save_push_subscription",
        {
          p_endpoint: SUBSCRIPTION_JSON.endpoint,
          p_p256dh: SUBSCRIPTION_JSON.keys.p256dh,
          p_auth: SUBSCRIPTION_JSON.keys.auth,
        },
      ],
    ]);
  });

  it("déjà abonné dans le navigateur : réutilise l'abonnement, le réenregistre en base", async () => {
    mockSupabase({ data: null, error: null });
    const { pushManager } = fakeBrowser({ permission: "granted", subscribed: true });
    await enablePush();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("autorisation refusée : erreur « denied », rien n'est enregistré", async () => {
    const calls = mockSupabase({ data: null, error: null });
    const { serviceWorker } = fakeBrowser({ answer: "denied" });
    await expect(enablePush()).rejects.toMatchObject({ name: "PushError", code: "denied" });
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(asCalls(calls)).toEqual([]);
  });

  it("refus de la base : l'abonnement du navigateur est retiré (pas d'abonnement fantôme)", async () => {
    mockSupabase({ data: null, error: { message: "forbidden", code: "42501" } });
    const { subscription } = fakeBrowser();
    await expect(enablePush()).rejects.toEqual(new AdminError("forbidden"));
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("échec du service worker ou de l'abonnement : erreur « unknown »", async () => {
    mockSupabase({ data: null, error: null });
    const { pushManager } = fakeBrowser();
    pushManager.subscribe.mockRejectedValueOnce(new Error("AbortError"));
    await expect(enablePush()).rejects.toMatchObject({ code: "unknown" });
  });

  it("clé VAPID absente : erreur « unsupported » après l'autorisation", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
    fakeBrowser();
    await expect(enablePush()).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("disablePush", () => {
  it("supprime en base puis se désabonne dans le navigateur", async () => {
    const calls = mockSupabase({ data: true, error: null });
    const { subscription } = fakeBrowser({ permission: "granted", subscribed: true });
    await disablePush();
    expect(asCalls(calls)).toEqual([
      ["rpc", "admin_delete_push_subscription", { p_endpoint: SUBSCRIPTION_JSON.endpoint }],
    ]);
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("pas abonné : rien à faire", async () => {
    const calls = mockSupabase({ data: true, error: null });
    fakeBrowser({ permission: "granted" });
    await disablePush();
    expect(asCalls(calls)).toEqual([]);
  });

  it("refus de la base : l'abonnement du navigateur est gardé (état cohérent)", async () => {
    mockSupabase({ data: null, error: { message: "boom" } });
    const { subscription } = fakeBrowser({ permission: "granted", subscribed: true });
    await expect(disablePush()).rejects.toEqual(new AdminError("unknown"));
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });
});

describe("sendTestPush", () => {
  it.each(["queued", "no_device", "not_configured"])(
    "renvoie la réponse de la base : %s",
    async (value) => {
      const calls = mockSupabase({ data: value, error: null });
      expect(await sendTestPush()).toBe(value);
      expect(asCalls(calls)).toEqual([["rpc", "admin_send_test_push"]]);
    },
  );

  it("erreur de la base : AdminError", async () => {
    mockSupabase({ data: null, error: { message: "forbidden", code: "42501" } });
    await expect(sendTestPush()).rejects.toEqual(new AdminError("forbidden"));
  });
});
