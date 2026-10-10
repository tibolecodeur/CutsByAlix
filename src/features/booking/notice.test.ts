import { describe, expect, it } from "vitest";
import { firstBookableDay, isTooSoonDay } from "@/features/booking/notice";

describe("firstBookableDay", () => {
  it("donne le jour (à Paris) qui tombe 48 h plus tard", () => {
    // Mardi 13 octobre 2026, 8 h à Paris → jeudi 15.
    expect(firstBookableDay(new Date("2026-10-13T06:00:00Z"))).toBe("2026-10-15");
  });

  it("raisonne en heure de Paris, pas en UTC", () => {
    // Mardi 13, 23 h 30 à Paris (21 h 30 UTC) → jeudi 15 à 23 h 30 : jeudi 15.
    expect(firstBookableDay(new Date("2026-10-13T21:30:00Z"))).toBe("2026-10-15");
    // Mercredi 14, 0 h 30 à Paris (mardi 22 h 30 UTC) → vendredi 16.
    expect(firstBookableDay(new Date("2026-10-13T22:30:00Z"))).toBe("2026-10-16");
  });

  it("compte 48 h réelles au passage à l'heure d'hiver (25 octobre)", () => {
    // Samedi 24, 1 h 30 à Paris (été, UTC+2) + 48 h = lundi 26, 0 h 30 (hiver, UTC+1).
    expect(firstBookableDay(new Date("2026-10-23T23:30:00Z"))).toBe("2026-10-26");
    // Samedi 24, 0 h 30 à Paris + 48 h = dimanche 25, 23 h 30 : encore dimanche.
    expect(firstBookableDay(new Date("2026-10-23T22:30:00Z"))).toBe("2026-10-25");
  });
});

describe("isTooSoonDay", () => {
  const now = new Date("2026-10-13T06:00:00Z"); // mardi 13, 8 h à Paris

  it("vrai pour aujourd'hui et demain, faux à partir du premier jour réservable", () => {
    expect(isTooSoonDay("2026-10-13", now)).toBe(true);
    expect(isTooSoonDay("2026-10-14", now)).toBe(true);
    expect(isTooSoonDay("2026-10-15", now)).toBe(false);
    expect(isTooSoonDay("2026-11-02", now)).toBe(false);
  });
});
