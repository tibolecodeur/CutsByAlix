import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminError,
  createAvailability,
  deleteAvailability,
  getAdminBookings,
  getAvailabilities,
  getLocations,
} from "@/features/admin/data";
import { formatTime } from "@/lib/dates";
import { resetFakeDb } from "@/lib/fakeDb";

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

describe("getLocations", () => {
  it("donne à l'admin les lieux avec leur adresse privée", async () => {
    const locations = await getLocations();
    expect(locations.map((l) => l.publicLabel)).toEqual(["Angers", "Saint-Christophe-du-Bois"]);
    expect(locations[0]!.privateAddress).toMatch(/fictive/);
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

describe("disponibilités", () => {
  it("liste les plages à venir et en ajoute une", async () => {
    const before = await getAvailabilities();
    expect(before[0]).toMatchObject({ locationLabel: "Saint-Christophe-du-Bois" });

    const [firstLocation] = await getLocations();
    const created = await createAvailability({
      locationId: firstLocation!.id,
      startsAt: "2026-10-19T08:00:00Z", // lundi, aucune dispo
      endsAt: "2026-10-19T12:00:00Z",
    });
    expect(created).toMatchObject({ locationLabel: "Angers" });
    expect(await getAvailabilities()).toHaveLength(before.length + 1);
  });

  it("refuse une fin avant le début, plus de 24 h, un lieu inconnu ou un chevauchement", async () => {
    const [firstLocation] = await getLocations();
    const base = { locationId: firstLocation!.id };
    await expectAdminError(
      createAvailability({
        ...base,
        startsAt: "2026-10-19T12:00:00Z",
        endsAt: "2026-10-19T08:00:00Z",
      }),
      "invalid_range",
    );
    await expectAdminError(
      createAvailability({
        ...base,
        startsAt: "2026-10-19T08:00:00Z",
        endsAt: "2026-10-20T09:00:00Z",
      }),
      "invalid_range",
    );
    await expectAdminError(
      createAvailability({
        locationId: "inconnu",
        startsAt: "2026-10-19T08:00:00Z",
        endsAt: "2026-10-19T09:00:00Z",
      }),
      "not_found",
    );
    // Aujourd'hui 9 h–21 h « Saint-Christophe-du-Bois » : chevauchement, même dans l'autre lieu.
    await expectAdminError(
      createAvailability({
        ...base,
        startsAt: "2026-10-13T16:00:00Z",
        endsAt: "2026-10-13T20:00:00Z",
      }),
      "availability_overlap",
    );
  });

  it("supprime une plage vide, refuse une plage qui contient des RDV", async () => {
    const availabilities = await getAvailabilities();
    const today = availabilities[0]!; // contient des RDV
    const sunday = availabilities.find((a) => a.startsAt.startsWith("2026-10-14"))!; // mercredi, vide

    await expectAdminError(deleteAvailability(today.id), "availability_has_bookings");
    await deleteAvailability(sunday.id);
    expect((await getAvailabilities()).some((a) => a.id === sunday.id)).toBe(false);
    await expectAdminError(deleteAvailability(sunday.id), "not_found");
  });
});
