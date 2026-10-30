import { describe, expect, it, vi } from "vitest";
import { handleNotify, safeEqual, type BookingRow, type NotifyDeps } from "./handler";

const SECRET = "secret-de-test-tres-long-0123456789";
const ID = "60000000-0000-4000-8000-000000000001";
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
    getBooking: vi.fn(async () => CONFIRMED),
    listSubscriptions: vi.fn(async () => SUBSCRIPTIONS),
    forgetSubscription: vi.fn(async () => {}),
    send: vi.fn(async () => ({ status: 201, gone: false })),
    ...overrides,
  };
}

function request(body: unknown, { secret = SECRET, method = "POST" } = {}) {
  return new Request("https://fonctions.example.test/notify-booking", {
    method,
    headers: { "x-notify-secret": secret, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

describe("handleNotify : accès", () => {
  it.each([
    ["mauvais secret", "mauvais-secret-mauvais-secret"],
    ["secret vide", ""],
  ])("%s : 401, rien n'est lu ni envoyé", async (_, secret) => {
    const d = deps();
    const response = await handleNotify(request({ kind: "test" }, { secret }), d);
    expect(response.status).toBe(401);
    expect(d.listSubscriptions).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it("secret non configuré côté fonction : tout est refusé, même avec un en-tête vide", async () => {
    const d = deps({ secret: "" });
    const response = await handleNotify(request({ kind: "test" }, { secret: "" }), d);
    expect(response.status).toBe(401);
  });

  it("autre méthode que POST : 405", async () => {
    const response = await handleNotify(request(null, { method: "GET" }), deps());
    expect(response.status).toBe(405);
  });

  it.each([
    ["type inconnu", { kind: "autre", booking_id: ID }],
    ["id manquant", { kind: "new_booking" }],
    ["id invalide", { kind: "new_booking", booking_id: "1; drop table" }],
    ["corps vide", null],
  ])("%s : 400", async (_, body) => {
    const response = await handleNotify(request(body), deps());
    expect(response.status).toBe(400);
  });
});

describe("handleNotify : envoi", () => {
  it("nouvelle réservation : un message chiffré par appareil, contenu attendu", async () => {
    const d = deps();
    const response = await handleNotify(request({ kind: "new_booking", booking_id: ID }), d);

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
    await handleNotify(request({ kind: "cancelled", booking_id: ID }), d);
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
    const response = await handleNotify(request({ kind, booking_id: ID }), d);
    expect(await response.json()).toEqual({ sent: 0, skipped: true });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("test : message de test, sans lire de réservation", async () => {
    const d = deps();
    await handleNotify(request({ kind: "test", booking_id: null }), d);
    expect(d.getBooking).not.toHaveBeenCalled();
    const payload = JSON.parse((d.send as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string);
    expect(payload.title).toBe("Notifications activées");
  });

  it("alerte de dépassement : message « Beaucoup d'activité », sans lire de réservation", async () => {
    const d = deps();
    await handleNotify(request({ kind: "overflow", booking_id: null }), d);
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
    const response = await handleNotify(request({ kind: "test" }), d);
    expect(await response.json()).toEqual({ sent: 0, removed: 1, failed: 1 });
    expect(d.forgetSubscription).toHaveBeenCalledWith("https://push.example.test/1");
  });

  it("réponse inattendue du service de push (500) : comptée en échec, abonnement gardé", async () => {
    const d = deps({ send: vi.fn(async () => ({ status: 500, gone: false })) });
    const response = await handleNotify(request({ kind: "test" }), d);
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
