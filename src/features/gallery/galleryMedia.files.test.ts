// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURED_PHOTOS } from "@/features/gallery/featuredPhotos";

/**
 * Garde-fous sur les photos de la vitrine (public/media/galerie/), commitées dans un dépôt
 * PUBLIC : aucune métadonnée (EXIF : GPS, date, appareil), poids raisonnable en 4G, et la liste
 * du code correspond exactement aux fichiers présents.
 */
const DIR = fileURLToPath(new URL("../../../public/media/galerie/", import.meta.url));
const KB = 1024;

/** Noms des blocs (« chunks ») d'un fichier WebP : format RIFF, 4 octets de nom + 4 de taille. */
function webpChunks(file: Buffer): string[] {
  const chunks: string[] = [];
  let offset = 12; // « RIFF », taille, « WEBP »
  while (offset + 8 <= file.length) {
    const size = file.readUInt32LE(offset + 4);
    chunks.push(file.toString("latin1", offset, offset + 4));
    offset += 8 + size + (size % 2); // les blocs sont alignés sur 2 octets
  }
  return chunks;
}

const files = readdirSync(DIR).sort();

describe("photos de la vitrine", () => {
  it("la liste du code et les fichiers du dossier correspondent exactement", () => {
    const listed = FEATURED_PHOTOS.map((photo) => photo.url.replace("/media/galerie/", "")).sort();
    expect(listed).toEqual(files);
  });

  it.each(files)("%s : WebP sans EXIF ni XMP, 150 Ko maximum", (name) => {
    const file = readFileSync(DIR + name);
    expect(file.toString("latin1", 0, 4)).toBe("RIFF");
    expect(file.toString("latin1", 8, 12)).toBe("WEBP");
    const chunks = webpChunks(file);
    expect(chunks).not.toContain("EXIF");
    expect(chunks).not.toContain("XMP ");
    expect(statSync(DIR + name).size).toBeLessThanOrEqual(150 * KB);
  });

  it("chaque photo a un texte alternatif et des dimensions", () => {
    for (const photo of FEATURED_PHOTOS) {
      expect(photo.altText.length).toBeGreaterThan(10);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
    }
  });
});
