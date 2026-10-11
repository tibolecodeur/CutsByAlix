import { describe, expect, it } from "vitest";
import { availabilityFormSchema } from "@/lib/schemas";

const VALID = {
  day: "2030-03-06",
  from: "10:00",
  to: "13:30",
  locationId: "20000000-0000-4000-8000-000000000001",
};

const messages = (input: unknown) => {
  const result = availabilityFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe("availabilityFormSchema", () => {
  it("accepte une plage complète", () => {
    expect(availabilityFormSchema.parse(VALID)).toEqual(VALID);
  });

  it("refuse un champ vide ou mal formé", () => {
    expect(messages({ ...VALID, day: "" })).toEqual(["invalid_input"]);
    expect(messages({ ...VALID, day: "06/03/2030" })).toEqual(["invalid_input"]);
    expect(messages({ ...VALID, from: "24:00" })).toContain("invalid_input");
  });

  it("exige un lieu", () => {
    expect(messages({ ...VALID, locationId: "" })).toEqual(["location_required"]);
  });

  it("refuse une fin égale ou antérieure au début", () => {
    expect(messages({ ...VALID, to: "10:00" })).toEqual(["invalid_range"]);
    expect(messages({ ...VALID, to: "09:59" })).toEqual(["invalid_range"]);
  });
});
