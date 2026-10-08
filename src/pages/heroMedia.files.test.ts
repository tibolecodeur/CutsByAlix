// @vitest-environment node
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous sur les fichiers du hero eux-mêmes (public/media/), pas seulement sur la balise :
 * un réencodage oublié de `-an` remettrait une piste audio, un mauvais réglage ferait exploser
 * le poids téléchargé en 4G. Plafonds : consigne 11 bis et docs/DESIGN.md.
 */
const MEDIA = fileURLToPath(new URL("../../public/media/", import.meta.url));
const KB = 1024;
const MB = 1024 * KB;

const read = (name: string) => readFileSync(MEDIA + name);
const size = (name: string) => statSync(MEDIA + name).size;

/**
 * Types de pistes d'un MP4 : chaque piste a une boîte `hdlr` dont le type de gestionnaire
 * (`vide`, `soun`…) suit le nom de la boîte, la version (4 octets) et un champ réservé (4 octets).
 */
function mp4HandlerTypes(file: Buffer): string[] {
  const types: string[] = [];
  for (let index = file.indexOf("hdlr"); index !== -1; index = file.indexOf("hdlr", index + 4)) {
    types.push(file.toString("latin1", index + 12, index + 16));
  }
  return types;
}

describe("médias du hero", () => {
  it("hero.mp4 : une piste vidéo, aucune piste audio, 3 Mo maximum", () => {
    const types = mp4HandlerTypes(read("hero.mp4"));
    expect(types).toContain("vide");
    expect(types).not.toContain("soun");
    expect(size("hero.mp4")).toBeLessThanOrEqual(3 * MB);
  });

  it("hero.mp4 : l'index (moov) est en tête du fichier, la lecture démarre sans tout télécharger", () => {
    const file = read("hero.mp4");
    expect(file.indexOf("moov")).toBeLessThan(file.indexOf("mdat"));
  });

  it("hero.webm : vidéo AV1, aucun codec audio, 3 Mo maximum", () => {
    const file = read("hero.webm").toString("latin1");
    expect(file).toContain("V_AV1");
    expect(file).not.toMatch(/A_(OPUS|VORBIS|AAC)/);
    expect(size("hero.webm")).toBeLessThanOrEqual(3 * MB);
  });

  it("hero-poster.jpg : 150 Ko maximum", () => {
    expect(size("hero-poster.jpg")).toBeLessThanOrEqual(150 * KB);
  });
});
