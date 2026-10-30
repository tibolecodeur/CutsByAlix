import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { handleNotify, safeEqual, signEvent, type BookingRow, type NotifyDeps } from "./handler";

const SECRET = "secret-de-test-tres-long-0123456789";
const ID = "60000000-0000-4000-8000-000000000001";
/** « Maintenant » figé, en secondes. */
const NOW = 1_790_000_000;
const SUBSCRIPTIONS = [
  { endpoint: "https://push.example.test/1", p256dh: "a", auth: "b" },
  { endpoint: "https://push.example.test/2", p256dh: "c", auth: "d" },
];
const CONFIRMED: BookingRow = {
  status: "confirmed",
  cancelled_by: null,
  starts_at: "2026-10-30T13:00:00Z",
  first_name: "Kevin",
  service_name: "Coupe",
};

function deps(overrides: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    secret: SECRET,
    nowSeconds: () => NOW,
    getBooking: vi.fn(async () => CONFIRMED),
    listSubscriptions: vi.fn(async () => SUBSCRIPTIONS),
    forgetSubscription: vi.fn(async () => {}),
    send: vi.fn(async () => ({ status: 201, gone: false })),
    ...overrides,
  };
}

type RequestOptions = { key?: string; method?: string; ts?: number; signature?: string };

/**
 * Requête comme l'envoie la base : corps { kind, booking_id, ts } et signature HMAC de
 * « kind:booking_id:ts » avec `key` (le secret partagé, par défaut).
 */
async function request(
  body: Record<string, unknown> | null,
  { key = SECRET, method = "POST", ts = NOW, signature }: RequestOptions = {},
) {
  const full = body && { booking_id: null, ...body, ts: body.ts ?? ts };
  const sig =
    signature ??
    (full
      ? await signEvent(
          key,
          String(full.kind),
          (full.booking_id as string | null) ?? null,
          Number(full.ts),
        )
      : "");
  return new Request("https://fonctions.example.test/notify-booking", {
    method,
    headers: { "x-notify-signature": sig, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(full) : undefined,
  });
}

describe("handleNotify : accès", () => {
  it("signature de la base : même calcul que encode(hmac(…, 'sha256'), 'hex') en SQL", async () => {
    const expected = createHmac("sha256", SECRET).update(`new_booking:${ID}:${NOW}`).digest("hex");
    expect(await signEvent(SECRET, "new_booking", ID, NOW)).toBe(expected);
    expect(await signEvent(SECRET, "test", null, NOW)).toBe(
      createHmac("sha256", SECRET).update(`test::${NOW}`).digest("hex"),
    );
  });

  it.each([
    ["signée avec un autre secret", { key: "un-autre-secret-un-autre-secret" }],
    ["sans signature", { signature: "" }],
    ["trop ancienne (6 min)", { ts: NOW - 360 }],
    ["dans le futur (2 min)", { ts: NOW + 120 }],
  ])("requête %s : 401, rien n'est lu ni envoyé", async (_, options) => {
    const d = deps();
    const response = await handleNotify(
      await request({ kind: "new_booking", booking_id: ID }, options),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.getBooking).not.toHaveBeenCalled();
    expect(d.listSubscriptions).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("signature d'un autre évènement réutilisée (autre id) : 401", async () => {
    const other = await signEvent(
      SECRET,
      "new_booking",
      "60000000-0000-4000-8000-000000000009",
      NOW,
    );
    const response = await handleNotify(
      await request({ kind: "new_booking", booking_id: ID }, { signature: other }),
      deps(),
    );
    expect(response.status).toBe(401);
  });

  it("récente (4 min) : acceptée (file de pg_net un peu lente)", async () => {
    const response = await handleNotify(
      await request({ kind: "new_booking", booking_id: ID }, { ts: NOW - 240 }),
      deps(),
    );
    expect(response.status).toBe(200);
  });

  it("secret absent ou trop court côté fonction : tout est refusé, même bien signé", async () => {
    const d = deps({ secret: "court" });
    const response = await handleNotify(await request({ kind: "test" }, { key: "court" }), d);
    expect(response.status).toBe(401);
  });

  it("autre méthode que POST : 405", async () => {
    const response = await handleNotify(await request(null, { method: "GET" }), deps());
    expect(response.status).toBe(405);
  });

  it.each([
    ["type inconnu", { kind: "autre", booking_id: ID }],
    ["id manquant", { kind: "new_booking" }],
    ["id invalide", { kind: "new_booking", booking_id: "1; drop table" }],
    ["horodatage manquant", { kind: "test", booking_id: null, ts: "hier" }],
    ["corps vide", null],
  ])("%s : 400", async (_, body) => {
    const response = await handleNotify(await request(body), deps());
    expect(response.status).toBe(400);
  });
});

describe("handleNotify : envoi", () => {
  it("nouvelle réservation : un message chiffré par appareil, contenu attendu", async () => {
    const d = deps();
    const response = await handleNotify(await request({ kind: "new_booking", booking_id: ID }), d);

    expect(await response.json()).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect(d.getBooking).toHaveBeenCalledWith(ID);
    expect(d.send).toHaveBeenCalledTimes(2);
    const payload = JSON.parse((d.send as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload).toEqual({
      title: "Nouvelle réservation",
      body: "Vendredi 30 octobre · 14:00\nKevin · Coupe",
      url: `/admin/rendez-vous/${ID}`,
      tag: `new_booking-${ID}`,
    });
  });

  it("annulation par le client : « Réservation annulée »", async () => {
    const d = deps({
      getBooking: vi.fn(async () => ({
        ...CONFIRMED,
        status: "cancelled",
        cancelled_by: "client",
      })),
    });
    await handleNotify(await request({ kind: "cancelled", booking_id: ID }), d);
    const payload = JSON.parse((d.send as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.title).toBe("Réservation annulée");
  });

  it.each([
    [
      "réservation déjà annulée",
      "new_booking",
      { ...CONFIRMED, status: "cancelled", cancelled_by: "client" },
    ],
    [
      "annulation par le barber",
      "cancelled",
      { ...CONFIRMED, status: "cancelled", cancelled_by: "barber" },
    ],
    ["réservation introuvable", "new_booking", null],
  ])("%s : rien n'est envoyé", async (_, kind, booking) => {
    const d = deps({ getBooking: vi.fn(async () => booking as BookingRow | null) });
    const response = await handleNotify(await request({ kind, booking_id: ID }), d);
    expect(await response.json()).toEqual({ sent: 0, skipped: true });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("test : message de test, sans lire de réservation", async () => {
    const d = deps();
    await handleNotify(await request({ kind: "test", booking_id: null }), d);
    expect(d.getBooking).not.toHaveBeenCalled();
    const payload = JSON.parse((d.send as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.title).toBe("Notifications activées");
  });

  it("alerte de dépassement : message « Beaucoup d'activité », sans lire de réservation", async () => {
    const d = deps();
    await handleNotify(await request({ kind: "overflow", booking_id: null }), d);
    expect(d.getBooking).not.toHaveBeenCalled();
    const payload = JSON.parse((d.send as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.title).toBe("Beaucoup d'activité");
  });

  it("appareil désabonné (410) : oublié ; appareil en panne : les autres reçoivent quand même", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ status: 410, gone: true })
      .mockRejectedValueOnce(new Error("réseau"));
    const d = deps({ send });
    const response = await handleNotify(await request({ kind: "test" }), d);
    expect(await response.json()).toEqual({ sent: 0, removed: 1, failed: 1 });
    expect(d.forgetSubscription).toHaveBeenCalledWith("https://push.example.test/1");
  });

  it("réponse inattendue du service de push (500) : comptée en échec, abonnement gardé", async () => {
    const d = deps({ send: vi.fn(async () => ({ status: 500, gone: false })) });
    const response = await handleNotify(await request({ kind: "test" }), d);
    expect(await response.json()).toEqual({ sent: 0, removed: 0, failed: 2 });
    expect(d.forgetSubscription).not.toHaveBeenCalled();
  });
});

describe("safeEqual", () => {
  it("égalité exacte seulement", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
