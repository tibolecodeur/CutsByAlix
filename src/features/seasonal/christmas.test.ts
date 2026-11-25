import { describe, expect, it } from "vitest";
import { isChristmasSeason } from "@/features/seasonal/christmas";

describe("isChristmasSeason : du 1er décembre au 6 janvier inclus, à Paris", () => {
  it.each([
    ["2026-11-30T22:59:00Z", false, "30 nov., 23 h 59 à Paris"],
    ["2026-11-30T23:00:00Z", true, "1er déc., minuit à Paris (encore le 30 en UTC)"],
    ["2026-12-15T10:00:00Z", true, "mi-décembre"],
    ["2026-12-31T23:30:00Z", true, "1er janv. à Paris"],
    ["2027-01-06T22:59:00Z", true, "6 janv., 23 h 59 à Paris"],
    ["2027-01-06T23:00:00Z", false, "7 janv., minuit à Paris"],
    ["2026-07-14T12:00:00Z", false, "été"],
  ])("%s → %s (%s)", (iso, expected) => {
    expect(isChristmasSeason(new Date(iso))).toBe(expected);
  });
});
