import { describe, expect, it } from "vitest";
import { buildBookingMessage, buildOverflowMessage, buildTestMessage, formatWhen } from "./message";

const BOOKING = {
  id: "60000000-0000-4000-8000-000000000001",
  startsAt: "2026-10-30T13:00:00Z", // 14:00 à Paris (heure d'hiver)
  firstName: "Kevin",
  serviceName: "Coupe + barbe",
};

describe("formatWhen", () => {
  it("jour et heure de Paris, jour en majuscule", () => {
    expect(formatWhen("2026-10-30T13:00:00Z")).toBe("Vendredi 30 octobre · 14:00");
  });

  it("suit le changement d'heure (été : UTC+2)", () => {
    expect(formatWhen("2026-07-14T08:30:00Z")).toBe("Mardi 14 juillet · 10:30");
  });

  it("un RDV tard le soir en UTC tombe le lendemain à Paris", () => {
    expect(formatWhen("2026-12-31T23:30:00Z")).toBe("Vendredi 1 janvier · 00:30");
  });

  it("date illisible : erreur plutôt qu'un texte faux", () => {
    expect(() => formatWhen("pas une date")).toThrow("invalid_date");
  });
});

describe("buildBookingMessage", () => {
  it("nouvelle réservation : titre, date et heure, puis prénom et prestation", () => {
    expect(buildBookingMessage("new_booking", BOOKING)).toEqual({
      title: "Nouvelle réservation",
      body: "Vendredi 30 octobre · 14:00\nKevin · Coupe + barbe",
      url: "/admin/rendez-vous/60000000-0000-4000-8000-000000000001",
      tag: "new_booking-60000000-0000-4000-8000-000000000001",
    });
  });

  it("annulation : titre dédié, même contenu", () => {
    const message = buildBookingMessage("cancelled", BOOKING);
    expect(message.title).toBe("Réservation annulée");
    expect(message.body).toBe("Vendredi 30 octobre · 14:00\nKevin · Coupe + barbe");
    expect(message.tag).toBe("cancelled-60000000-0000-4000-8000-000000000001");
  });

  it("prénom très long : coupé pour tenir sur l'écran verrouillé", () => {
    const message = buildBookingMessage("new_booking", {
      ...BOOKING,
      firstName: "Jean-Christophe-Emmanuel-Alexandre",
    });
    expect(message.body.split("\n")[1]).toBe("Jean-Christophe-Emmanue… · Coupe + barbe");
  });

  it("aucun nom de famille, téléphone ni e-mail ne peut s'y glisser", () => {
    const message = buildBookingMessage("new_booking", BOOKING);
    expect(Object.keys(message).sort()).toEqual(["body", "tag", "title", "url"]);
  });
});

describe("buildTestMessage", () => {
  it("message de test vers l'accueil de l'admin", () => {
    expect(buildTestMessage()).toMatchObject({ title: "Notifications activées", url: "/admin" });
  });
});

describe("buildOverflowMessage", () => {
  it("limite atteinte : une alerte sans détail, vers la liste des rendez-vous", () => {
    expect(buildOverflowMessage()).toEqual({
      title: "Beaucoup d'activité",
      body: "Plusieurs réservations ou annulations en peu de temps : ouvre l'admin pour les voir.",
      url: "/admin/rendez-vous",
      tag: "overflow",
    });
  });
});
