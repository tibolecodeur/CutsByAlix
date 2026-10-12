import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INSTAGRAM } from "@/lib/contact";

/**
 * Aucune adresse stockée (ADR 0008, consigne 24) : plus aucune trace de l'ancienne colonne
 * d'adresse dans le front ni dans le seed de production. Lecture de fichiers seulement.
 * Le nom de la colonne est reconstruit ici pour que ce fichier ne se trouve pas lui-même.
 */
const root = process.cwd();
const COLUMN = ["private", "address"].join("_");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("aucune adresse stockée", () => {
  it(`aucun fichier de src/ ni supabase/seed.sql ne mentionne ${COLUMN}`, () => {
    const files = [...filesUnder(resolve(root, "src")), resolve(root, "supabase/seed.sql")];
    expect(files.length).toBeGreaterThan(50);
    const found = files
      .filter((file) => readFileSync(file, "utf8").includes(COLUMN))
      .map((file) => relative(root, file));
    expect(found).toEqual([]);
  });

  it("le seed crée « Les Ponts-de-Cé » et plus « Angers »", () => {
    const seed = readFileSync(resolve(root, "supabase/seed.sql"), "utf8");
    expect(seed).toContain("'Les Ponts-de-Cé'");
    expect(seed).not.toContain("'Angers'");
  });
});

describe("contact Instagram", () => {
  it("pseudo et lien du compte d'Alix, en https", () => {
    expect(INSTAGRAM).toEqual({
      handle: "CutsByAlix",
      url: "https://www.instagram.com/cutsbyalix/",
    });
  });
});
