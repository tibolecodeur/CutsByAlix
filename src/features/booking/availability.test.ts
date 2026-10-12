import { describe, expect, it } from "vitest";
import {
  calendarDays,
  countByDay,
  dayLabel,
  hasAvailableDay,
} from "@/features/booking/availability";
import { formatDayKey } from "@/lib/dates";

describe("calendarDays : les 28 jours à partir d'aujourd'hui, à Paris", () => {
  it("commence aujourd'hui (Paris) et compte 28 jours consécutifs", () => {
    const days = calendarDays(new Date("2030-05-14T09:00:00Z"));
    expect(days).toHaveLength(28);
    expect(days[0]).toBe("2030-05-14");
    expect(days[27]).toBe("2030-06-10");
    expect(new Set(days).size).toBe(28);
  });

  it("23 h 30 à Paris est encore aujourd'hui, 00 h 30 est déjà demain (été, UTC+2)", () => {
    // 21:30 UTC = 23:30 à Paris le 14 juillet ; 22:30 UTC = 00:30 à Paris le 15 juillet,
    // alors qu'en UTC on serait encore le 14.
    expect(calendarDays(new Date("2030-07-14T21:30:00Z"))[0]).toBe("2030-07-14");
    expect(calendarDays(new Date("2030-07-14T22:30:00Z"))[0]).toBe("2030-07-15");
  });

  it("même chose en hiver (UTC+1)", () => {
    expect(calendarDays(new Date("2030-01-14T22:30:00Z"))[0]).toBe("2030-01-14");
    expect(calendarDays(new Date("2030-01-14T23:30:00Z"))[0]).toBe("2030-01-15");
  });

  it("ne saute ni ne double aucun jour au passage à l'heure d'été (31 mars 2030)", () => {
    const days = calendarDays(new Date("2030-03-30T12:00:00Z"));
    expect(days.slice(0, 4)).toEqual(["2030-03-30", "2030-03-31", "2030-04-01", "2030-04-02"]);
    expect(new Set(days).size).toBe(28);
  });

  it("ne saute ni ne double aucun jour au passage à l'heure d'hiver (27 octobre 2030)", () => {
    const days = calendarDays(new Date("2030-10-26T12:00:00Z"));
    expect(days.slice(0, 4)).toEqual(["2030-10-26", "2030-10-27", "2030-10-28", "2030-10-29"]);
    expect(new Set(days).size).toBe(28);
  });

  it("le jour de l'heure d'été à 00 h 30 (Paris) : aujourd'hui est le 31 mars", () => {
    // 23:30 UTC le 30 mars = 00:30 CET le 31 mars (avant le passage de 2 h à 3 h).
    expect(calendarDays(new Date("2030-03-30T23:30:00Z"))[0]).toBe("2030-03-31");
  });
});

describe("countByDay et hasAvailableDay : jour disponible ou non", () => {
  const shown = calendarDays(new Date("2030-05-14T09:00:00Z")); // 14 mai → 10 juin 2030

  it("liste vide : aucun jour n'est disponible", () => {
    const counts = countByDay([]);
    expect(counts.size).toBe(0);
    expect(counts.get("2030-05-15") ?? 0).toBe(0);
    expect(hasAvailableDay(shown, counts)).toBe(false);
  });

  it("un seul créneau : ce jour est disponible, les autres non", () => {
    const counts = countByDay([{ day: "2030-05-20", slotCount: 1 }]);
    expect(counts.get("2030-05-20")).toBe(1);
    expect(counts.get("2030-05-21") ?? 0).toBe(0);
    expect(hasAvailableDay(shown, counts)).toBe(true);
  });

  it("des créneaux sur deux jours : chacun garde son nombre", () => {
    const counts = countByDay([
      { day: "2030-05-20", slotCount: 3 },
      { day: "2030-05-21", slotCount: 2 },
    ]);
    expect(counts.get("2030-05-20")).toBe(3);
    expect(counts.get("2030-05-21")).toBe(2);
    expect(counts.size).toBe(2);
  });

  it("un jour passé, trop proche ou hors période n'est pas dans la liste : indisponible", () => {
    // La base ne renvoie que les jours avec créneau : un jour absent est sans créneau.
    const counts = countByDay([{ day: "2030-05-20", slotCount: 1 }]);
    for (const absent of ["2030-05-13", "2030-05-14", "2030-06-11", "2030-06-30"]) {
      expect(counts.get(absent) ?? 0).toBe(0);
    }
  });

  it("une disponibilité hors des 28 jours affichés ne compte pas", () => {
    const counts = countByDay([
      { day: "2030-05-13", slotCount: 2 }, // veille du premier jour affiché
      { day: "2030-06-11", slotCount: 2 }, // lendemain du dernier
    ]);
    expect(hasAvailableDay(shown, counts)).toBe(false);
  });

  it("le tout premier et le tout dernier jour affichés comptent", () => {
    expect(hasAvailableDay(shown, countByDay([{ day: "2030-05-14", slotCount: 1 }]))).toBe(true);
    expect(hasAvailableDay(shown, countByDay([{ day: "2030-06-10", slotCount: 1 }]))).toBe(true);
  });

  it("un compteur à zéro n'est pas un jour disponible", () => {
    expect(hasAvailableDay(shown, countByDay([{ day: "2030-05-20", slotCount: 0 }]))).toBe(false);
  });
});

describe("dayLabel : le nom accessible d'un jour", () => {
  const name = formatDayKey("2030-05-20");

  it("dit combien de créneaux, au singulier et au pluriel", () => {
    expect(dayLabel("2030-05-20", 1)).toBe(`${name}, 1 créneau disponible`);
    expect(dayLabel("2030-05-20", 2)).toBe(`${name}, 2 créneaux disponibles`);
    expect(dayLabel("2030-05-20", 12)).toBe(`${name}, 12 créneaux disponibles`);
  });

  it("dit « aucun créneau disponible » pour un jour sans créneau", () => {
    expect(dayLabel("2030-05-20", 0)).toBe(`${name}, aucun créneau disponible`);
  });

  it("ne dit rien de plus que le jour quand la disponibilité est inconnue", () => {
    expect(dayLabel("2030-05-20", undefined)).toBe(name);
  });
});
