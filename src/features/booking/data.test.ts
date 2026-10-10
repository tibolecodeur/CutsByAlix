import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { FAKE_CANCEL_TOKENS, fakeDb, resetFakeDb } from "@/lib/fakeDb";
import { getSupabase, SupabaseConfigError } from "@/lib/supabase";
import { fakeSupabaseClient, SERVICE_ROWS, type FakeQueryResult } from "@/test/fakeSupabase";

// Prestations, créneaux et réservation passent par Supabase : le client est simulé, aucune
// requête ne part. Consultation et annulation sont encore sur la fausse base (fakeDb).
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

/** Horloge figée : mardi 13 octobre 2026, 8 h à Paris (pour la fausse base de l'annulation). */
const NOW = new Date("2026-10-13T06:00:00Z");

const SERVICE_ID = "10000000-0000-4000-8000-000000000001";
const LOCATION_ID = "20000000-0000-4000-8000-000000000001";
const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";

beforeEach(() => {
  // Seul `Date` est simulé : les promesses et les timers restent réels.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetFakeDb(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

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

  it("rejette en cas d'erreur réseau ou de base", async () => {
    mockSupabase({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(getServices()).rejects.toThrow(/Lecture des prestations impossible/);
  });

  it("rejette sans planter si les variables Supabase manquent", async () => {
    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expect(getServices()).rejects.toBeInstanceOf(SupabaseConfigError);
  });

  it("transmet les prestations lues à la fausse base (pont provisoire de l'annulation)", async () => {
    const demoIds = fakeDb().services.map((s) => s.id);
    mockSupabase({ data: SERVICE_ROWS, error: null });
    await getServices();
    await getServices(); // relu : mise à jour, pas de doublon
    expect(fakeDb().services.map((s) => s.id)).toEqual([
      ...demoIds,
      SERVICE_ROWS[0]!.id,
      SERVICE_ROWS[1]!.id,
    ]);
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
          location_label: "Angers",
        },
      ],
      error: null,
    });

    expect(await getAvailableSlots(SERVICE_ID, "2026-10-20")).toEqual([
      {
        startsAt: "2026-10-20T12:00:00+00:00",
        endsAt: "2026-10-20T13:00:00+00:00",
        locationId: LOCATION_ID,
        locationLabel: "Angers",
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

  it("rejette en cas d'erreur réseau ou de base (l'écran propose « Réessayer »)", async () => {
    mockSupabase({ data: null, error: { message: "TypeError: Failed to fetch" } });
    await expect(getAvailableSlots(SERVICE_ID, "2026-10-20")).rejects.toThrow(
      /Lecture des créneaux impossible/,
    );
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
          location_label: "Angers",
          cancel_token: TOKEN,
        },
      ],
      error: null,
    });

    const receipt = await createBooking(bookingInput());

    expect(receipt).toEqual({
      startsAt: "2026-10-20T12:00:00+00:00",
      endsAt: "2026-10-20T13:00:00+00:00",
      serviceName: "Coupe",
      locationLabel: "Angers",
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
        },
      ],
    ]);
  });

  it("transmet le honeypot rempli tel quel : c'est la base qui refuse", async () => {
    const calls = mockSupabase({
      data: null,
      error: { code: "P0001", message: "invalid_input" },
    });
    await expectBookingError(createBooking(bookingInput({ website: "spam" })), "invalid_input");
    expect(calls[0]!.args[1]).toMatchObject({ p_website: "spam" });
  });

  it.each(["invalid_input", "slot_unavailable", "too_soon", "too_far", "limit_reached"])(
    "traduit l'erreur métier %s de la base",
    async (code) => {
      mockSupabase({ data: null, error: { code: "P0001", message: code } });
      await expectBookingError(createBooking(bookingInput()), code);
    },
  );

  it("classe en « unknown » une erreur réseau, une panne, ou un message inconnu", async () => {
    mockSupabase({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } });
    await expectBookingError(createBooking(bookingInput()), "unknown");

    // Même message qu'une clé connue, mais pas une exception métier (code différent).
    mockSupabase({ data: null, error: { code: "42501", message: "slot_unavailable" } });
    await expectBookingError(createBooking(bookingInput()), "unknown");

    mockSupabase({ data: null, error: { code: "P0001", message: "autre_chose" } });
    await expectBookingError(createBooking(bookingInput()), "unknown");
  });

  it("classe en « unknown » une réponse vide ou une config manquante", async () => {
    mockSupabase({ data: [], error: null });
    await expectBookingError(createBooking(bookingInput()), "unknown");

    vi.mocked(getSupabase).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectBookingError(createBooking(bookingInput()), "unknown");
  });

  it("ne recopie jamais le message brut de la base dans l'erreur", async () => {
    mockSupabase({
      data: null,
      error: { code: "XX000", message: `détail interne ${TOKEN} 0639980010` },
    });
    const error = await createBooking(bookingInput()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BookingError);
    expect((error as Error).message).toBe("unknown");
  });
});

describe("getBooking (encore factice)", () => {
  it("donne le détail d'un RDV annulable, sans adresse ni coordonnées", async () => {
    const details = await getBooking(FAKE_CANCEL_TOKENS.valid);
    expect(details).toEqual({
      status: "confirmed",
      startsAt: "2026-10-17T08:00:00.000Z",
      endsAt: "2026-10-17T09:00:00.000Z",
      serviceName: "Coupe + barbe",
      locationLabel: "Angers",
      firstName: "Lucas",
      canCancel: true,
    });
    expect(JSON.stringify(details)).not.toMatch(/fictive|@/);
  });

  it("indique un RDV annulé, qui ne s'annule plus", async () => {
    expect(await getBooking(FAKE_CANCEL_TOKENS.cancelled)).toMatchObject({
      status: "cancelled",
      canCancel: false,
    });
  });

  it("n'autorise plus l'annulation à moins de 24 h", async () => {
    expect(await getBooking(FAKE_CANCEL_TOKENS.tooLate)).toMatchObject({
      status: "confirmed",
      canCancel: false,
    });
  });

  it("renvoie null pour un lien inconnu ou mal formé", async () => {
    expect(await getBooking("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getBooking("pas-un-uuid")).toBeNull();
    expect(await getBooking("")).toBeNull();
  });
});

describe("cancelBooking (encore factice)", () => {
  it("annule une fois, puis renvoie false", async () => {
    expect(await cancelBooking(FAKE_CANCEL_TOKENS.valid)).toBe(true);
    expect(await getBooking(FAKE_CANCEL_TOKENS.valid)).toMatchObject({ status: "cancelled" });
    expect(await cancelBooking(FAKE_CANCEL_TOKENS.valid)).toBe(false);
  });

  it("refuse à moins de 24 h du RDV (too_late)", async () => {
    await expectBookingError(cancelBooking(FAKE_CANCEL_TOKENS.tooLate), "too_late");
  });

  it("renvoie false pour un lien inconnu ou mal formé", async () => {
    expect(await cancelBooking("00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await cancelBooking("pas-un-uuid")).toBe(false);
  });
});
