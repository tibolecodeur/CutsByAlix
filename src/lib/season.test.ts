import { describe, expect, it } from "vitest";
import { resolveSeason, seasonFor } from "@/lib/season";

/** Instant à minuit passé d'une minute, heure de Paris, le jour donné. */
const paris = (day: string) => new Date(`${day}T00:01:00+01:00`);

describe("seasonFor (calendrier, heure de Paris)", () => {
  it.each([
    ["2026-11-30", "base"],
    ["2026-12-01", "noel"],
    ["2026-12-25", "noel"],
    ["2026-12-31", "noel"],
    ["2027-01-01", "noel"],
    ["2027-01-06", "noel"],
    ["2027-01-07", "base"],
    ["2027-07-14", "base"],
  ])("%s → %s", (day, season) => {
    expect(seasonFor(paris(day))).toBe(season);
  });

  it("revient seule chaque année, sans rien changer", () => {
    expect(seasonFor(paris("2030-12-10"))).toBe("noel");
    expect(seasonFor(paris("2031-02-01"))).toBe("base");
  });

  it("heure de Paris, pas celle du téléphone : 30 nov. 23 h 30 UTC = 1er déc. à Paris", () => {
    expect(seasonFor(new Date("2026-11-30T23:30:00Z"))).toBe("noel");
  });
});

describe("resolveSeason", () => {
  const november = paris("2026-11-05");
  const december = paris("2026-12-10");

  it("par défaut (auto) : le calendrier", () => {
    expect(resolveSeason({ now: november })).toBe("base");
    expect(resolveSeason({ now: december, setting: "auto" })).toBe("noel");
  });

  it("VITE_SEASON force une version, quelle que soit la date", () => {
    expect(resolveSeason({ now: december, setting: "base" })).toBe("base");
    expect(resolveSeason({ now: november, setting: " NOEL " })).toBe("noel");
  });

  it("?saison= dans l'adresse l'emporte (aperçu)", () => {
    expect(resolveSeason({ now: november, setting: "base", search: "?saison=noel" })).toBe("noel");
    expect(resolveSeason({ now: december, search: "?x=1&saison=base" })).toBe("base");
  });

  it("valeur inconnue : ignorée", () => {
    expect(resolveSeason({ now: november, setting: "paques", search: "?saison=halloween" })).toBe(
      "base",
    );
  });
});
