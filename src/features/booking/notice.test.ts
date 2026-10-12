import { describe, expect, it } from "vitest";
import { firstBookableDay, isTooSoonDay, isWithinCancelNotice } from "@/features/booking/notice";

// Octobre 2026 : heure d'été à Paris (UTC+2) jusqu'au dimanche 25.

describe("firstBookableDay (délai de 2 h)", () => {
  it("le matin, le jour même reste réservable", () => {
    // Mardi 13 octobre, 8 h à Paris + 2 h = 10 h : encore mardi.
    expect(firstBookableDay(new Date("2026-10-13T06:00:00Z"))).toBe("2026-10-13");
  });

  it("limite nette : 21 h 59 → ce soir encore possible, 22 h 01 → dès demain", () => {
    // 21 h 59 à Paris (19 h 59 UTC) + 2 h = 23 h 59 : mardi.
    expect(firstBookableDay(new Date("2026-10-13T19:59:00Z"))).toBe("2026-10-13");
    // 22 h 01 à Paris (20 h 01 UTC) + 2 h = 0 h 01 : mercredi.
    expect(firstBookableDay(new Date("2026-10-13T20:01:00Z"))).toBe("2026-10-14");
  });

  it("raisonne en heure de Paris, pas en UTC", () => {
    // 23 h 30 à Paris (21 h 30 UTC) + 2 h = mercredi 1 h 30 à Paris, mardi 23 h 30 UTC.
    expect(firstBookableDay(new Date("2026-10-13T21:30:00Z"))).toBe("2026-10-14");
    // 0 h 30 à Paris mercredi (mardi 22 h 30 UTC) + 2 h = mercredi 2 h 30 à Paris.
    expect(firstBookableDay(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-14");
  });

  it("compte 2 h réelles autour du changement d'heure (24 → 25 octobre)", () => {
    // Avant le changement (UTC+2) : 21 h 59 à Paris + 2 h = 23 h 59 le 24 ; 22 h 01 → le 25.
    expect(firstBookableDay(new Date("2026-10-24T19:59:00Z"))).toBe("2026-10-24");
    expect(firstBookableDay(new Date("2026-10-24T20:01:00Z"))).toBe("2026-10-25");
    // Après (UTC+1) : minuit à Paris tombe à 23 h UTC. 21 h 59 + 2 h = 23 h 59 le 25 ; 22 h 01 → le 26.
    expect(firstBookableDay(new Date("2026-10-25T20:59:00Z"))).toBe("2026-10-25");
    expect(firstBookableDay(new Date("2026-10-25T21:01:00Z"))).toBe("2026-10-26");
  });
});

describe("isTooSoonDay", () => {
  it("avant 22 h, aujourd'hui n'est pas trop tôt ; les jours passés le sont", () => {
    const now = new Date("2026-10-13T19:59:00Z"); // mardi 13, 21 h 59 à Paris
    expect(isTooSoonDay("2026-10-12", now)).toBe(true);
    expect(isTooSoonDay("2026-10-13", now)).toBe(false);
    expect(isTooSoonDay("2026-10-14", now)).toBe(false);
  });

  it("à partir de 22 h 01, aujourd'hui est trop tôt, demain non", () => {
    const now = new Date("2026-10-13T20:01:00Z"); // mardi 13, 22 h 01 à Paris
    expect(isTooSoonDay("2026-10-13", now)).toBe(true);
    expect(isTooSoonDay("2026-10-14", now)).toBe(false);
    expect(isTooSoonDay("2026-11-02", now)).toBe(false);
  });
});

describe("isWithinCancelNotice (délai d'annulation de 24 h)", () => {
  const now = new Date("2026-10-13T10:00:00Z");

  it("vrai à moins de 24 h, faux à 24 h pile et au-delà (même bord que la base)", () => {
    expect(isWithinCancelNotice("2026-10-13T15:00:00Z", now)).toBe(true); // dans 5 h
    expect(isWithinCancelNotice("2026-10-14T09:59:00Z", now)).toBe(true); // 23 h 59
    expect(isWithinCancelNotice("2026-10-14T10:00:00Z", now)).toBe(false); // 24 h pile
    expect(isWithinCancelNotice("2026-10-14T10:01:00Z", now)).toBe(false); // 24 h 01
  });
});
