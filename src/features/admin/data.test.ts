import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminError,
  createAvailability,
  deleteAvailability,
  getAdminBookings,
  getAvailabilities,
  getBookingRules,
  getLocations,
} from "@/features/admin/data";
import { formatTime } from "@/lib/dates";
import { resetFakeDb } from "@/lib/fakeDb";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fakeSupabaseClient, type FakeQueryResult } from "@/test/fakeSupabase";

// Lieux et disponibilités passent par Supabase : client admin simulé, aucune requête ne part.
// Les rendez-vous restent sur la fausse base (src/lib/fakeDb.ts).
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
  resetFakeDb(NOW);
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
  location_label: "Angers",
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
  it("lit les lieux actifs, id et libellé public seulement (jamais l'adresse privée)", async () => {
    const calls = mockSupabase({
      data: [{ id: LOCATION_ID, public_label: "Angers" }],
      error: null,
    });
    expect(await getLocations()).toEqual([{ id: LOCATION_ID, publicLabel: "Angers" }]);
    expect(asCalls(calls).slice(0, 4)).toEqual([
      ["from", "locations"],
      ["select", "id, public_label"],
      ["eq", "active", true],
      ["order", "public_label"],
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/private_address|\*/);
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
        locationLabel: "Angers",
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
    expect(created).toMatchObject({ locationLabel: "Angers", slotCount: 3, bookingCount: 0 });
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

describe("getAdminBookings", () => {
  it("liste les RDV confirmés d'une période, dans l'ordre, avec le client", async () => {
    const today = await getAdminBookings({
      from: "2026-10-12T22:00:00Z",
      to: "2026-10-13T22:00:00Z",
    });
    expect(today.map((b) => [formatTime(b.startsAt), b.firstName])).toEqual([
      ["09:00", "Nathan"],
      ["11:00", "Sami"],
      ["19:00", "Hugo"],
    ]);
    expect(today[0]).toMatchObject({
      serviceName: "Coupe",
      locationLabel: "Saint-Christophe-du-Bois",
      phone: "0639980001",
      status: "confirmed",
    });
  });

  it("inclut les annulés sur demande", async () => {
    const all = await getAdminBookings({ from: NOW.toISOString(), includeCancelled: true });
    const confirmed = await getAdminBookings({ from: NOW.toISOString() });
    expect(all.filter((b) => b.status === "cancelled")).toHaveLength(1);
    expect(confirmed).toHaveLength(all.length - 1);
  });
});
