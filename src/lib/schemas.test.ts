import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("Zod sans eval (CSP)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("n'appelle jamais `Function` : schémas créés et validés même si la CSP l'interdit", async () => {
    // Simule un navigateur dont la CSP interdit eval : `Function(…)` lève une EvalError.
    vi.resetModules();
    const forbidden = vi.fn(() => {
      throw new EvalError("Refused to evaluate a string as JavaScript (CSP)");
    });
    vi.stubGlobal("Function", forbidden);

    const fresh = await import("@/lib/schemas");
    expect(fresh.availabilityFormSchema.safeParse(VALID).success).toBe(true);
    expect(fresh.availabilityFormSchema.safeParse({ ...VALID, to: "09:00" }).success).toBe(false);
    expect(forbidden).not.toHaveBeenCalled();
  });

  it("src/lib/schemas.ts est le seul fichier qui importe Zod (la config s'y exécute avant tout schéma)", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
      });
    const importers = sources(resolve(process.cwd(), "src"))
      .filter((path) =>
        /from\s+["']zod(\/[^"']*)?["']|import\(["']zod/.test(readFileSync(path, "utf8")),
      )
      .map((path) => path.replaceAll("\\", "/").replace(/^.*\/src\//, "src/"));
    expect(importers).toEqual(["src/lib/schemas.ts"]);
    expect(readFileSync(resolve(process.cwd(), "src/lib/schemas.ts"), "utf8")).toMatch(
      /^z\.config\(\{ jitless: true \}\);$/m,
    );
  });
});
