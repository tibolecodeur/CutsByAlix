import { describe, expect, it } from "vitest";
import {
  canBarberCancel,
  cancelledLabel,
  countConfirmed,
  describeCount,
  formatPhone,
  mailtoHref,
  groupByParisDay,
  splitForDashboard,
} from "@/features/admin/bookings";
import type { AdminBooking } from "@/features/admin/data";

// « Maintenant » est toujours passé en paramètre : aucune dépendance à la date du jour.
/** Mardi 13 octobre 2026, 8 h à Paris (heure d'été, UTC+2). */
const NOW = new Date("2026-10-13T06:00:00Z");

function booking(startsAt: string, fields: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id: startsAt,
    status: "confirmed",
    cancelledBy: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    serviceName: "Coupe",
    locationLabel: "Les Ponts-de-Cé",
    firstName: "Léa",
    lastName: "Martin",
    ...fields,
  };
}

describe("groupByParisDay", () => {
  it("regroupe par jour de Paris et repère aujourd'hui", () => {
    const groups = groupByParisDay(
      [
        booking("2026-10-13T07:00:00Z"), // mardi 9 h
        booking("2026-10-13T21:30:00Z"), // mardi 23 h 30 à Paris
        booking("2026-10-13T22:30:00Z"), // mercredi 0 h 30 à Paris
      ],
      NOW,
    );
    expect(groups.map((g) => [g.day, g.isToday, g.bookings.length])).toEqual([
      ["2026-10-13", true, 2],
      ["2026-10-14", false, 1],
    ]);
  });

  it("garde l'ordre reçu (« Passées » : du plus récent au plus ancien)", () => {
    const groups = groupByParisDay(
      [booking("2026-10-12T08:00:00Z"), booking("2026-10-10T08:00:00Z")],
      NOW,
    );
    expect(groups.map((g) => g.day)).toEqual(["2026-10-12", "2026-10-10"]);
  });

  it("changement d'heure : 0 h 30 le dimanche 25 octobre reste le 25 à Paris", () => {
    // 24 octobre 22 h 30 UTC = 25 octobre 0 h 30 à Paris (encore UTC+2 avant 3 h).
    const groups = groupByParisDay([booking("2026-10-24T22:30:00Z")], NOW);
    expect(groups[0]!.day).toBe("2026-10-25");
  });
});

describe("compteur et droit d'annuler", () => {
  it("ne compte que les confirmés", () => {
    expect(
      countConfirmed([
        booking("2026-10-14T08:00:00Z"),
        booking("2026-10-15T08:00:00Z", { status: "cancelled", cancelledBy: "client" }),
      ]),
    ).toBe(1);
  });

  it("formule le compteur", () => {
    expect(describeCount(0, "à venir")).toBe("Aucun rendez-vous confirmé à venir");
    expect(describeCount(1, "à venir")).toBe("1 rendez-vous confirmé à venir");
    expect(describeCount(3, "ces 30 derniers jours")).toBe(
      "3 rendez-vous confirmés ces 30 derniers jours",
    );
  });

  it("Alix annule un RDV confirmé pas commencé, même dans moins de 24 h", () => {
    expect(canBarberCancel(booking("2026-10-13T06:01:00Z"), NOW)).toBe(true);
    expect(canBarberCancel(booking("2026-10-13T06:00:00Z"), NOW)).toBe(false); // commence pile
    expect(canBarberCancel(booking("2026-10-13T05:30:00Z"), NOW)).toBe(false); // en cours
    expect(canBarberCancel(booking("2026-10-20T08:00:00Z", { status: "cancelled" }), NOW)).toBe(
      false,
    );
  });
});

describe("splitForDashboard", () => {
  it("aujourd'hui, puis les 7 jours suivants, confirmés seulement", () => {
    const { today, upcoming } = splitForDashboard(
      [
        booking("2026-10-13T05:30:00Z"), // aujourd'hui, en cours
        booking("2026-10-13T16:00:00Z", { status: "cancelled", cancelledBy: "barber" }),
        booking("2026-10-14T08:00:00Z"), // demain
        booking("2026-10-20T20:00:00Z"), // mardi 20, 22 h à Paris : 7e jour
        booking("2026-10-20T22:30:00Z"), // mercredi 21, 0 h 30 à Paris : 8e jour
      ],
      NOW,
      7,
    );
    expect(today.map((b) => b.startsAt)).toEqual(["2026-10-13T05:30:00Z"]);
    expect(upcoming.map((b) => b.startsAt)).toEqual([
      "2026-10-14T08:00:00Z",
      "2026-10-20T20:00:00Z",
    ]);
  });
});

describe("cancelledLabel", () => {
  it("dit qui a annulé", () => {
    expect(cancelledLabel("barber")).toBe("Annulé par toi");
    expect(cancelledLabel("client")).toBe("Annulé par le client");
  });
});

describe("mailtoHref", () => {
  it("garde une adresse normale lisible", () => {
    expect(mailtoHref("lea.martin+rdv@example.test")).toBe("mailto:lea.martin%2Brdv@example.test");
  });

  it("neutralise ?cc= / &body= glissés dans l'e-mail (aucun destinataire ajouté)", () => {
    const href = mailtoHref("x@a.fr?cc=espion%40evil.test&body=Bonjour");
    expect(href).toBe("mailto:x@a.fr%3Fcc%3Despion%2540evil.test%26body%3DBonjour");
    expect(href).not.toMatch(/[?&]/);
  });
});

describe("formatPhone", () => {
  it("espace les numéros français, laisse les internationaux", () => {
    expect(formatPhone("0639980001")).toBe("06 39 98 00 01");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
  });
});
