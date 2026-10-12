import { describe, expect, it, vi } from "vitest";
import {
  BookingError,
  cancelBooking,
  createBooking,
  getAvailableSlots,
  getBooking,
  getServices,
  isUuid,
  type NewBooking,
} from "@/features/booking/data";
import { getSupabase, SupabaseConfigError } from "@/lib/supabase";
import { fakeSupabaseClient, SERVICE_ROWS, type FakeQueryResult } from "@/test/fakeSupabase";

// Tout passe par Supabase : le client est simulé, aucune requête ne part.
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  getSupabase: vi.fn(),
}));

/** Simule la réponse de Supabase ; renvoie la liste des appels faits sur le client. */
function mockSupabase(result: FakeQueryResult) {
  const fake = fakeSupabaseClient(result);
  vi.mocked(getSupabase).mockReturnValue(fake.client);
  return fake.calls;
}

const SERVICE_ID = "10000000-0000-4000-8000-000000000001";
const LOCATION_ID = "20000000-0000-4000-8000-000000000001";
const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";
const REQUEST_ID = "5b0c3e1a-9d2f-4a6b-8c7d-1e2f3a4b5c6d";

function bookingInput(overrides: Partial<NewBooking> = {}): NewBooking {
  return {
    serviceId: SERVICE_ID,
    startsAt: "2026-10-20T12:00:00.000Z", // mardi 20, 14 h à Paris
    locationId: LOCATION_ID,
    firstName: " Zoé ",
    lastName: "Durand",
    phone: " 06 39 98 00 10 ",
    email: "",
    website: "",
    ...overrides,
  };
}

async function expectBookingError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(BookingError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("getServices", () => {
  it("lit les prestations triées, avec les seules colonnes lisibles par anon, sans filtre active", async () => {
    const calls = mockSupabase({ data: SERVICE_ROWS, error: null });

    expect(await getServices()).toEqual([
      { id: SERVICE_ROWS[0]!.id, name: "Coupe", durationMin: 60, priceLabel: null },
      { id: SERVICE_ROWS[1]!.id, name: "Coupe + barbe", durationMin: 60, priceLabel: "20 €" },
    ]);
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      ["from", "services"],
      ["select", "id, name, duration_min, price_label"],
      ["order", "sort_order"],
      ["order", "name"],
      ["abortSignal", expect.any(AbortSignal)],
    ]);
  });

  it("renvoie une liste vide s'il n'y a aucune prestation", async () => {
    mockSupabase({ data: [], error: null });
    expect(await getServices()).toEqual([]);
  });

  it("rejette en cas d'erreur réseau ou de base, sans recopier le message d'origine (C-01)", async () => {
    mockSupabase({ data: null, error: { message: 'relation "public.services" does not exist' } });
    const error = await getServices().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BookingError);
    expect(error).toMatchObject({ code: "unknown", message: "unknown" });
  });

  it("rejette sans planter si les variables Supabase manquent", async () => {
    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectBookingError(getServices(), "unknown");
  });

  it.each([
    ["vide", null],
    ["de forme inattendue", { unexpected: true }],
    ["avec une ligne incomplète", [{ id: "s1", name: "Coupe" }]],
    ["avec une durée qui n'est pas un nombre", [{ ...SERVICE_ROWS[0], duration_min: "60" }]],
  ])("refuse une réponse %s (C-02) : invalid_response", async (_label, data) => {
    mockSupabase({ data, error: null });
    await expectBookingError(getServices(), "invalid_response");
  });
});

describe("getAvailableSlots", () => {
  it("appelle la RPC avec la prestation et le jour, et convertit chaque créneau", async () => {
    const calls = mockSupabase({
      data: [
        {
          starts_at: "2026-10-20T12:00:00+00:00",
          ends_at: "2026-10-20T13:00:00+00:00",
          location_id: LOCATION_ID,
          location_label: "Les Ponts-de-Cé",
        },
      ],
      error: null,
    });

    expect(await getAvailableSlots(SERVICE_ID, "2026-10-20")).toEqual([
      {
        startsAt: "2026-10-20T12:00:00+00:00",
        endsAt: "2026-10-20T13:00:00+00:00",
        locationId: LOCATION_ID,
        locationLabel: "Les Ponts-de-Cé",
      },
    ]);
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      ["rpc", "get_available_slots", { p_service_id: SERVICE_ID, p_day: "2026-10-20" }],
      ["abortSignal", expect.any(AbortSignal)],
    ]);
  });

  it("renvoie une liste vide quand la base n'a aucun créneau", async () => {
    mockSupabase({ data: [], error: null });
    expect(await getAvailableSlots(SERVICE_ID, "2026-10-20")).toEqual([]);
  });

  it("rejette en cas d'erreur réseau ou de base, sans le message d'origine (l'écran propose « Réessayer »)", async () => {
    mockSupabase({ data: null, error: { message: "JWT expired" } });
    const error = await getAvailableSlots(SERVICE_ID, "2026-10-20").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BookingError);
    expect(error).toMatchObject({ code: "unknown", message: "unknown" });
  });

  it.each([
    ["vide", null],
    ["de forme inattendue", { unexpected: true }],
    [
      "avec une date illisible",
      [{ starts_at: "mardi", ends_at: "x", location_id: LOCATION_ID, location_label: "Lieu" }],
    ],
  ])("refuse une réponse %s (C-02) : invalid_response", async (_label, data) => {
    mockSupabase({ data, error: null });
    await expectBookingError(getAvailableSlots(SERVICE_ID, "2026-10-20"), "invalid_response");
  });
});

describe("createBooking", () => {
  it("envoie le créneau, son lieu et les coordonnées à la RPC, sans délai d'abandon", async () => {
    const calls = mockSupabase({
      data: [
        {
          starts_at: "2026-10-20T12:00:00+00:00",
          ends_at: "2026-10-20T13:00:00+00:00",
          service_name: "Coupe",
          location_label: "Les Ponts-de-Cé",
          cancel_token: TOKEN,
        },
      ],
      error: null,
    });

    const receipt = await createBooking(bookingInput(), REQUEST_ID);

    expect(receipt).toEqual({
      startsAt: "2026-10-20T12:00:00+00:00",
      endsAt: "2026-10-20T13:00:00+00:00",
      serviceName: "Coupe",
      locationLabel: "Les Ponts-de-Cé",
      cancelToken: TOKEN,
    });
    expect(isUuid(receipt.cancelToken)).toBe(true);
    // Champs vides envoyés à null ; nettoyage et validation complets côté base. Pas
    // d'`abortSignal` : couper la requête n'annulerait pas la réservation en base.
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      [
        "rpc",
        "create_booking",
        {
          p_service_id: SERVICE_ID,
          p_starts_at: "2026-10-20T12:00:00.000Z",
          p_location_id: LOCATION_ID,
          p_first_name: " Zoé ",
          p_last_name: "Durand",
          p_phone: "06 39 98 00 10",
          p_email: null,
          p_website: null,
          p_request_id: REQUEST_ID,
        },
      ],
    ]);
  });

  it("sans source aléatoire sûre, envoie p_request_id à null (comportement d'avant)", async () => {
    const calls = mockSupabase({
      data: null,
      error: { code: "P0001", message: "slot_unavailable" },
    });
    await expectBookingError(createBooking(bookingInput(), null), "slot_unavailable");
    expect(calls[0]!.args[1]).toMatchObject({ p_request_id: null });
  });

  it("transmet le honeypot rempli tel quel : c'est la base qui refuse", async () => {
    const calls = mockSupabase({
      data: null,
      error: { code: "P0001", message: "invalid_input" },
    });
    await expectBookingError(
      createBooking(bookingInput({ website: "spam" }), REQUEST_ID),
      "invalid_input",
    );
    expect(calls[0]!.args[1]).toMatchObject({ p_website: "spam" });
  });

  it.each([
    "invalid_input",
    "slot_unavailable",
    "too_soon",
    "too_far",
    "limit_reached",
    "request_conflict",
  ])("traduit l'erreur métier %s de la base", async (code) => {
    mockSupabase({ data: null, error: { code: "P0001", message: code } });
    await expectBookingError(createBooking(bookingInput(), REQUEST_ID), code);
  });

  it("classe en « unknown » une erreur réseau, une panne, ou un message inconnu", async () => {
    mockSupabase({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expectBookingError(createBooking(bookingInput(), REQUEST_ID), "unknown");

    // Même message qu'une clé connue, mais pas une exception métier (code différent).
    mockSupabase({ data: null, error: { code: "42501", message: "slot_unavailable" } });
    await expectBookingError(createBooking(bookingInput(), REQUEST_ID), "unknown");

    mockSupabase({ data: null, error: { code: "P0001", message: "autre_chose" } });
    await expectBookingError(createBooking(bookingInput(), REQUEST_ID), "unknown");
  });

  it.each([
    ["sans ligne", []],
    ["vide", null],
    ["de forme inattendue", { unexpected: true }],
    [
      "avec deux lignes",
      [
        {
          starts_at: "2026-10-20T12:00:00+00:00",
          ends_at: "2026-10-20T13:00:00+00:00",
          service_name: "Coupe",
          location_label: "Lieu",
          cancel_token: TOKEN,
        },
        {
          starts_at: "2026-10-20T12:00:00+00:00",
          ends_at: "2026-10-20T13:00:00+00:00",
          service_name: "Coupe",
          location_label: "Lieu",
          cancel_token: TOKEN,
        },
      ],
    ],
    [
      "avec un jeton mal formé",
      [
        {
          starts_at: "2026-10-20T12:00:00+00:00",
          ends_at: "2026-10-20T13:00:00+00:00",
          service_name: "Coupe",
          location_label: "Lieu",
          cancel_token: "abc",
        },
      ],
    ],
  ])(
    "refuse une réponse %s (C-02) : invalid_response, jamais un faux succès",
    async (_label, data) => {
      mockSupabase({ data, error: null });
      await expectBookingError(createBooking(bookingInput(), REQUEST_ID), "invalid_response");
    },
  );

  it("classe en « unknown » une config manquante", async () => {
    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectBookingError(createBooking(bookingInput(), REQUEST_ID), "unknown");
  });

  it("base SANS la migration d'idempotence (PGRST202) : « unknown », aucun détail recopié", async () => {
    // Réponse réelle de PostgREST (HTTP 404) quand le nouveau front envoie p_request_id à une
    // base qui n'a pas encore la fonction à 9 paramètres (ADR 0009, ordre de mise en production).
    const message =
      "Could not find the function public.create_booking(p_email, p_first_name, p_request_id) in the schema cache";
    mockSupabase({ data: null, error: { code: "PGRST202", message } });
    const error = await createBooking(bookingInput(), REQUEST_ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BookingError);
    expect(error).toMatchObject({ code: "unknown", message: "unknown" });
    expect(String(error)).not.toMatch(/PGRST|create_booking|schema cache|p_request_id/);
  });

  it("ne recopie jamais le message brut de la base dans l'erreur", async () => {
    mockSupabase({
      data: null,
      error: { code: "XX000", message: `détail interne ${TOKEN} 0639980010` },
    });
    const error = await createBooking(bookingInput(), REQUEST_ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(BookingError);
    expect((error as Error).message).toBe("unknown");
  });
});

describe("getBooking", () => {
  const ROW = {
    status: "confirmed",
    starts_at: "2026-10-20T12:00:00+00:00",
    ends_at: "2026-10-20T13:00:00+00:00",
    service_name: "Coupe",
    location_label: "Les Ponts-de-Cé",
    first_name: "Lucas",
    can_cancel: true,
    cancelled_by: null,
  };

  it("envoie le jeton dans le corps de la RPC et convertit la ligne reçue", async () => {
    const calls = mockSupabase({ data: [ROW], error: null });

    expect(await getBooking(TOKEN)).toEqual({
      status: "confirmed",
      startsAt: "2026-10-20T12:00:00+00:00",
      endsAt: "2026-10-20T13:00:00+00:00",
      serviceName: "Coupe",
      locationLabel: "Les Ponts-de-Cé",
      firstName: "Lucas",
      canCancel: true,
      cancelledBy: null,
    });
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      ["rpc", "get_booking", { p_token: TOKEN }],
      ["abortSignal", expect.any(AbortSignal)],
    ]);
  });

  it("ne renvoie ni adresse, ni téléphone, ni email, ni identifiant", async () => {
    mockSupabase({ data: [ROW], error: null });
    expect(Object.keys((await getBooking(TOKEN))!).sort()).toEqual([
      "canCancel",
      "cancelledBy",
      "endsAt",
      "firstName",
      "locationLabel",
      "serviceName",
      "startsAt",
      "status",
    ]);
  });

  it("renvoie un RDV annulé tel quel, avec qui l'a annulé", async () => {
    mockSupabase({
      data: [{ ...ROW, status: "cancelled", can_cancel: false, cancelled_by: "barber" }],
      error: null,
    });
    expect(await getBooking(TOKEN)).toMatchObject({
      status: "cancelled",
      canCancel: false,
      cancelledBy: "barber",
    });
  });

  it("renvoie null quand la base ne renvoie aucune ligne (inconnu ou expiré)", async () => {
    mockSupabase({ data: [], error: null });
    expect(await getBooking(TOKEN)).toBeNull();
  });

  it("renvoie null pour un jeton mal formé, sans interroger la base", async () => {
    const calls = mockSupabase({ data: [ROW], error: null });
    expect(await getBooking("pas-un-uuid")).toBeNull();
    expect(await getBooking("")).toBeNull();
    expect(calls).toEqual([]);
  });

  it("rejette en cas d'erreur réseau, sans recopier le message d'origine ni le jeton", async () => {
    mockSupabase({ data: null, error: { message: `échec pour ${TOKEN}` } });
    const error = await getBooking(TOKEN).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BookingError);
    expect(error).toMatchObject({ code: "unknown", message: "unknown" });
    expect(JSON.stringify(error) + String(error)).not.toContain(TOKEN);
  });

  it("rejette sans planter si les variables Supabase manquent", async () => {
    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectBookingError(getBooking(TOKEN), "unknown");
  });

  it.each([
    ["vide", null],
    ["de forme inattendue (pas « Lien invalide »)", { unexpected: true }],
    ["avec deux lignes", [ROW, ROW]],
    ["avec un statut inconnu", [{ ...ROW, status: "pending" }]],
    ["avec un auteur d'annulation inconnu", [{ ...ROW, cancelled_by: "robot" }]],
  ])("refuse une réponse %s (C-02) : invalid_response", async (_label, data) => {
    mockSupabase({ data, error: null });
    await expectBookingError(getBooking(TOKEN), "invalid_response");
  });
});

describe("cancelBooking", () => {
  it("envoie le jeton à la RPC, sans délai d'abandon, et renvoie true", async () => {
    const calls = mockSupabase({ data: true, error: null });
    expect(await cancelBooking(TOKEN)).toBe(true);
    expect(calls.map(({ method, args }) => [method, ...args])).toEqual([
      ["rpc", "cancel_booking", { p_token: TOKEN }],
    ]);
  });

  it("renvoie false pour un lien inconnu, déjà annulé ou terminé (réponse identique)", async () => {
    mockSupabase({ data: false, error: null });
    expect(await cancelBooking(TOKEN)).toBe(false);
  });

  it("renvoie false pour un jeton mal formé, sans interroger la base", async () => {
    const calls = mockSupabase({ data: true, error: null });
    expect(await cancelBooking("pas-un-uuid")).toBe(false);
    expect(calls).toEqual([]);
  });

  it.each([
    ["vide (null)", null],
    ["vide (chaîne)", ""],
    ["de forme inattendue", { unexpected: true }],
    ["en tableau", [true]],
  ])("refuse une réponse %s (C-02) : invalid_response, jamais « annulé »", async (_label, data) => {
    mockSupabase({ data, error: null });
    await expectBookingError(cancelBooking(TOKEN), "invalid_response");
  });

  it("traduit l'erreur too_late de la base (moins de 24 h avant le RDV)", async () => {
    mockSupabase({ data: null, error: { code: "P0001", message: "too_late" } });
    await expectBookingError(cancelBooking(TOKEN), "too_late");
  });

  it("classe en « unknown » une erreur réseau ou une config manquante, sans le jeton", async () => {
    mockSupabase({
      data: null,
      error: { code: "", message: `TypeError: Failed to fetch ${TOKEN}` },
    });
    const error = await cancelBooking(TOKEN).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "unknown", message: "unknown" });

    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectBookingError(cancelBooking(TOKEN), "unknown");
  });
});
