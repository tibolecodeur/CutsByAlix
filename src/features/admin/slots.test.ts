import { describe, expect, it } from "vitest";
import {
  bookableWindow,
  describeSlots,
  formatDelay,
  groupByParisWeek,
  opensAt,
  slotStarts,
  type BookingRules,
} from "@/features/admin/slots";
import { formatTime, parisDateTime } from "@/lib/dates";

// Valeurs de private.settings() à la date de la consigne 18 (passées en paramètre, jamais lues
// dans le code : elles peuvent changer).
const RULES: BookingRules = { slotStepMin: 70, minNoticeMin: 48 * 60, maxAdvanceDays: 28 };

const paris = (day: string, time: string) => parisDateTime(day, time);
const times = (dates: Date[]) => dates.map((d) => formatTime(d));

describe("slotStarts", () => {
  it("découpe une plage au pas de 70 min depuis son début", () => {
    expect(
      times(slotStarts(paris("2030-03-06", "10:00"), paris("2030-03-06", "13:30"), 70)),
    ).toEqual(["10:00", "11:10", "12:20"]);
  });

  it("compte un créneau qui finit pile à la fin, pas un créneau qui dépasse d'une minute", () => {
    expect(slotStarts(paris("2030-03-06", "10:00"), paris("2030-03-06", "11:10"), 70)).toHaveLength(
      1,
    );
    expect(slotStarts(paris("2030-03-06", "10:00"), paris("2030-03-06", "11:09"), 70)).toHaveLength(
      0,
    );
    expect(slotStarts(paris("2030-03-06", "10:00"), paris("2030-03-06", "13:29"), 70)).toHaveLength(
      2,
    );
  });

  it("avance en temps absolu à la nuit du passage à l'heure d'hiver (comme la base)", () => {
    // Dim. 27 octobre 2030, 0 h – 5 h à Paris = 6 h réelles : 5 créneaux (même résultat que pgTAP).
    const starts = slotStarts(paris("2030-10-27", "00:00"), paris("2030-10-27", "05:00"), 70);
    expect(starts).toHaveLength(5);
    expect(times(starts)).toEqual(["00:00", "01:10", "02:20", "02:30", "03:40"]);
  });

  it("ne boucle pas sur un pas nul, négatif ou une fin avant le début", () => {
    const start = paris("2030-03-06", "10:00");
    expect(slotStarts(start, paris("2030-03-06", "12:00"), 0)).toEqual([]);
    expect(slotStarts(start, paris("2030-03-06", "12:00"), -70)).toEqual([]);
    expect(slotStarts(start, paris("2030-03-06", "09:00"), 70)).toEqual([]);
  });
});

describe("describeSlots", () => {
  it("formule l'aperçu au singulier, au pluriel et sans créneau", () => {
    const start = paris("2030-03-06", "10:00");
    expect(describeSlots(slotStarts(start, paris("2030-03-06", "13:30"), 70))).toBe(
      "3 créneaux : 10:00, 11:10, 12:20",
    );
    expect(describeSlots([start])).toBe("1 créneau : 10:00");
    expect(describeSlots([])).toBe("Aucun créneau");
  });
});

describe("opensAt", () => {
  it("recule de 28 jours calendaires à la même heure de Paris, même au changement d'heure", () => {
    // Créneau le 10 avril 2030 (heure d'été) : ouverture le 13 mars (heure d'hiver), 10 h à Paris.
    const opening = opensAt(paris("2030-04-10", "10:00"), 28);
    expect(opening.toISOString()).toBe(paris("2030-03-13", "10:00").toISOString());
    expect(opening.toISOString()).toBe("2030-03-13T09:00:00.000Z");
  });
});

describe("bookableWindow", () => {
  // Maintenant : lundi 4 mars 2030, 9 h à Paris.
  const now = paris("2030-03-04", "09:00");

  it("plage proche : réservable dès maintenant, jusqu'au dernier créneau moins 48 h", () => {
    const starts = slotStarts(paris("2030-03-08", "10:00"), paris("2030-03-08", "13:30"), 70);
    expect(bookableWindow(starts, RULES, now)).toEqual({
      status: "bookable",
      from: null,
      until: paris("2030-03-06", "12:20"),
      tooSoonCount: 0,
    });
  });

  it("plage lointaine : ouverture 28 jours avant le premier créneau", () => {
    const starts = slotStarts(paris("2030-05-01", "10:00"), paris("2030-05-01", "12:20"), 70);
    expect(bookableWindow(starts, RULES, now)).toEqual({
      status: "bookable",
      from: paris("2030-04-03", "10:00"),
      until: paris("2030-04-29", "11:10"),
      tooSoonCount: 0,
    });
  });

  it("plage à cheval sur la limite des 48 h : signale les créneaux trop proches", () => {
    // Maintenant = lundi 4 mars, 11 h : le créneau de 10:00 le 6 est à 47 h, les deux autres passent.
    const starts = slotStarts(paris("2030-03-06", "10:00"), paris("2030-03-06", "13:30"), 70);
    const result = bookableWindow(starts, RULES, paris("2030-03-04", "11:00"));
    expect(result).toEqual({
      status: "bookable",
      from: null,
      until: paris("2030-03-04", "12:20"),
      tooSoonCount: 1,
    });
  });

  it("à exactement 48 h, le créneau est encore proposé ; à 47 h 59, plus du tout", () => {
    const starts = [paris("2030-03-06", "09:00")];
    expect(bookableWindow(starts, RULES, now)).toEqual({
      status: "bookable",
      from: null,
      until: now,
      tooSoonCount: 0,
    });
    expect(bookableWindow(starts, RULES, paris("2030-03-04", "09:01"))).toEqual({
      status: "never",
    });
  });

  it("plage entière à moins de 48 h ou sans créneau : jamais proposée", () => {
    const tomorrow = slotStarts(paris("2030-03-05", "10:00"), paris("2030-03-05", "13:30"), 70);
    expect(bookableWindow(tomorrow, RULES, now)).toEqual({ status: "never" });
    expect(bookableWindow([], RULES, now)).toEqual({ status: "never" });
  });
});

describe("formatDelay", () => {
  it("affiche les heures rondes en heures, le reste en minutes", () => {
    expect(formatDelay(2880)).toBe("48 h");
    expect(formatDelay(90)).toBe("90 min");
  });
});

describe("groupByParisWeek", () => {
  it("regroupe du lundi au dimanche en heure de Paris", () => {
    const items = [
      // Dimanche 10 mars, 23 h 30 UTC = lundi 11 mars, 0 h 30 à Paris : semaine suivante.
      { id: "lundi-paris", startsAt: "2030-03-10T23:30:00Z" },
      { id: "mardi", startsAt: "2030-03-05T09:00:00Z" },
      { id: "dimanche", startsAt: "2030-03-10T09:00:00Z" },
    ];
    expect(groupByParisWeek(items)).toEqual([
      { monday: "2030-03-11", items: [items[0]] },
      { monday: "2030-03-04", items: [items[1], items[2]] },
    ]);
  });
});
