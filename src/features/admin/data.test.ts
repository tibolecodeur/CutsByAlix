import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminError,
  cancelAdminBooking,
  createAvailability,
  deleteAvailability,
  getAdminBooking,
  getAdminBookings,
  getAvailabilities,
  getBookingRules,
  getLocations,
} from "@/features/admin/data";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fakeSupabaseClient, type FakeQueryResult } from "@/test/fakeSupabase";

// Lieux, disponibilités et rendez-vous passent par Supabase : client admin simulé, aucune
// requête ne part.
vi.mock("@/lib/supabaseAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseAdmin")>()),
  getSupabaseAdmin: vi.fn(),
}));

/** Simule la réponse de Supabase ; renvoie la liste des appels faits sur le client. */
function mockSupabase(result: FakeQueryResult) {
  const fake = fakeSupabaseClient(result);
  vi.mocked(getSupabaseAdmin).mockReturnValue(fake.client);
  return fake.calls;
}

const asCalls = (calls: { method: string; args: unknown[] }[]) =>
  calls.map(({ method, args }) => [method, ...args]);

/** Mardi 13 octobre 2026, 8 h à Paris (voir booking/data.test.ts pour les données). */
const NOW = new Date("2026-10-13T06:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function expectAdminError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AdminError);
  await expect(promise).rejects.toMatchObject({ code });
}

const LOCATION_ID = "20000000-0000-4000-8000-000000000001";
const AVAILABILITY_ROW = {
  id: "50000000-0000-4000-8000-000000000001",
  location_id: LOCATION_ID,
  location_label: "Les Ponts-de-Cé",
  starts_at: "2026-10-20T08:00:00+00:00",
  ends_at: "2026-10-20T11:30:00+00:00",
  slot_count: 3,
  booking_count: 1,
};

describe("getBookingRules", () => {
  it("lit les règles de private.settings() via la RPC admin", async () => {
    const calls = mockSupabase({
      data: [{ slot_step_min: 70, min_notice_min: 2880, max_advance_days: 28 }],
      error: null,
    });
    expect(await getBookingRules()).toEqual({
      slotStepMin: 70,
      minNoticeMin: 2880,
      maxAdvanceDays: 28,
    });
    expect(asCalls(calls)[0]).toEqual(["rpc", "admin_booking_rules"]);
  });

  it("refus de droits → forbidden ; réponse vide → unknown", async () => {
    mockSupabase({ data: null, error: { code: "42501", message: "forbidden" } });
    await expectAdminError(getBookingRules(), "forbidden");
    mockSupabase({ data: [], error: null });
    await expectAdminError(getBookingRules(), "unknown");
  });
});

describe("getLocations", () => {
  it("lit les lieux actifs, id et libellé public seulement (jamais select *)", async () => {
    const calls = mockSupabase({
      data: [{ id: LOCATION_ID, public_label: "Les Ponts-de-Cé" }],
      error: null,
    });
    expect(await getLocations()).toEqual([{ id: LOCATION_ID, publicLabel: "Les Ponts-de-Cé" }]);
    expect(asCalls(calls).slice(0, 4)).toEqual([
      ["from", "locations"],
      ["select", "id, public_label"],
      ["eq", "active", true],
      ["order", "public_label"],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/\*/);
  });

  it("une config absente devient une panne neutre", async () => {
    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new Error("config");
    });
    await expectAdminError(getLocations(), "unknown");
  });
});

describe("disponibilités", () => {
  it("liste les plages avec leurs créneaux et réservations", async () => {
    const calls = mockSupabase({ data: [AVAILABILITY_ROW], error: null });
    expect(await getAvailabilities()).toEqual([
      {
        id: AVAILABILITY_ROW.id,
        locationId: LOCATION_ID,
        locationLabel: "Les Ponts-de-Cé",
        startsAt: AVAILABILITY_ROW.starts_at,
        endsAt: AVAILABILITY_ROW.ends_at,
        slotCount: 3,
        bookingCount: 1,
      },
    ]);
    expect(asCalls(calls)[0]).toEqual(["rpc", "admin_list_availabilities"]);
  });

  it("crée une plage via la RPC admin, avec les instants absolus", async () => {
    const calls = mockSupabase({ data: [{ ...AVAILABILITY_ROW, booking_count: 0 }], error: null });
    const created = await createAvailability({
      locationId: LOCATION_ID,
      startsAt: "2026-10-20T08:00:00.000Z",
      endsAt: "2026-10-20T11:30:00.000Z",
    });
    expect(created).toMatchObject({
      locationLabel: "Les Ponts-de-Cé",
      slotCount: 3,
      bookingCount: 0,
    });
    expect(asCalls(calls)).toEqual([
      [
        "rpc",
        "admin_create_availability",
        {
          p_location_id: LOCATION_ID,
          p_starts_at: "2026-10-20T08:00:00.000Z",
          p_ends_at: "2026-10-20T11:30:00.000Z",
        },
      ],
    ]);
  });

  it.each([
    "invalid_input",
    "invalid_range",
    "in_past",
    "too_short",
    "location_inactive",
    "availability_overlap",
  ])("traduit le refus métier %s", async (code) => {
    mockSupabase({ data: null, error: { code: "P0001", message: code } });
    await expectAdminError(
      createAvailability({ locationId: LOCATION_ID, startsAt: "x", endsAt: "y" }),
      code,
    );
  });

  it("ne garde jamais un message inconnu, ni une clé connue hors P0001", async () => {
    mockSupabase({ data: null, error: { code: "23P01", message: "availability_overlap" } });
    await expectAdminError(
      createAvailability({ locationId: LOCATION_ID, startsAt: "x", endsAt: "y" }),
      "unknown",
    );
    mockSupabase({ data: null, error: { code: "P0001", message: "texte inattendu" } });
    await expectAdminError(getAvailabilities(), "unknown");
  });

  it("supprime une plage ; refus si des réservations existent ou si elle n'existe plus", async () => {
    const calls = mockSupabase({ data: null, error: null });
    await deleteAvailability(AVAILABILITY_ROW.id);
    expect(asCalls(calls)).toEqual([
      ["rpc", "admin_delete_availability", { p_id: AVAILABILITY_ROW.id }],
    ]);

    mockSupabase({ data: null, error: { code: "P0001", message: "availability_has_bookings" } });
    await expectAdminError(deleteAvailability(AVAILABILITY_ROW.id), "availability_has_bookings");
    mockSupabase({ data: null, error: { code: "P0001", message: "not_found" } });
    await expectAdminError(deleteAvailability(AVAILABILITY_ROW.id), "not_found");
  });
});

/** Ligne de admin_list_bookings : contacts FICTIFS, jamais de vraies données. */
const BOOKING_ROW = {
  id: "60000000-0000-4000-8000-000000000001",
  starts_at: "2026-10-20T08:00:00+00:00",
  ends_at: "2026-10-20T09:00:00+00:00",
  service_name: "Coupe",
  location_label: "Les Ponts-de-Cé",
  first_name: "Léa",
  last_name: "Martin",
  status: "confirmed",
  cancelled_by: null,
};

describe("getAdminBookings", () => {
  it("appelle admin_list_bookings avec la portée et traduit les lignes", async () => {
    const calls = mockSupabase({
      data: [BOOKING_ROW, { ...BOOKING_ROW, id: "x", status: "cancelled", cancelled_by: "barber" }],
      error: null,
    });
    const bookings = await getAdminBookings("upcoming");
    expect(asCalls(calls)[0]).toEqual(["rpc", "admin_list_bookings", { p_scope: "upcoming" }]);
    expect(bookings[0]).toEqual({
      id: BOOKING_ROW.id,
      status: "confirmed",
      cancelledBy: null,
      startsAt: BOOKING_ROW.starts_at,
      endsAt: BOOKING_ROW.ends_at,
      serviceName: "Coupe",
      locationLabel: "Les Ponts-de-Cé",
      firstName: "Léa",
      lastName: "Martin",
    });
    expect(bookings[1]).toMatchObject({ status: "cancelled", cancelledBy: "barber" });
  });

  it("refus de droits → forbidden ; panne → unknown, sans recopier le message", async () => {
    mockSupabase({ data: null, error: { code: "42501", message: "forbidden" } });
    await expectAdminError(getAdminBookings("past"), "forbidden");
    mockSupabase({ data: null, error: { code: "08006", message: "Léa Martin 0639980001" } });
    const promise = getAdminBookings("past");
    await expectAdminError(promise, "unknown");
    await expect(promise).rejects.not.toHaveProperty("message", expect.stringContaining("Léa"));
  });
});

describe("getAdminBooking", () => {
  it("renvoie le détail avec le contact du client", async () => {
    const calls = mockSupabase({
      data: [{ ...BOOKING_ROW, phone: "0639980001", email: "lea@example.test" }],
      error: null,
    });
    expect(await getAdminBooking(BOOKING_ROW.id)).toMatchObject({
      firstName: "Léa",
      phone: "0639980001",
      email: "lea@example.test",
    });
    expect(asCalls(calls)[0]).toEqual(["rpc", "admin_get_booking", { p_id: BOOKING_ROW.id }]);
  });

  it("inconnu → not_found (erreur de la base ou réponse vide)", async () => {
    mockSupabase({ data: null, error: { code: "P0001", message: "not_found" } });
    await expectAdminError(getAdminBooking(BOOKING_ROW.id), "not_found");
    mockSupabase({ data: [], error: null });
    await expectAdminError(getAdminBooking(BOOKING_ROW.id), "not_found");
  });
});

describe("cancelAdminBooking", () => {
  it("appelle admin_cancel_booking ; « déjà annulé » (false) n'est pas une erreur", async () => {
    const calls = mockSupabase({ data: false, error: null });
    await expect(cancelAdminBooking(BOOKING_ROW.id)).resolves.toBeUndefined();
    expect(asCalls(calls)[0]).toEqual(["rpc", "admin_cancel_booking", { p_id: BOOKING_ROW.id }]);
  });

  it("RDV commencé → already_started", async () => {
    mockSupabase({ data: null, error: { code: "P0001", message: "already_started" } });
    await expectAdminError(cancelAdminBooking(BOOKING_ROW.id), "already_started");
  });
});
