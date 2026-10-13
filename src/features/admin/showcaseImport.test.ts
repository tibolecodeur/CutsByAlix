import { describe, expect, it, vi } from "vitest";
import type { AdminGalleryItem, NewGalleryItem } from "@/features/admin/gallery";
import {
  importShowcasePhotos,
  resumeFrom,
  ShowcaseImportError,
  type ShowcaseImportDeps,
} from "@/features/admin/showcaseImport";
import type { GalleryPhoto } from "@/features/gallery/data";
import type { ProcessedImage } from "@/features/gallery/processImage";

/** Import des photos de la vitrine dans la galerie gérée : dépendances simulées. */

const PHOTOS: GalleryPhoto[] = ["a", "b", "c"].map((name) => ({
  id: `vitrine-${name}`,
  url: `/media/galerie/${name}.webp`,
  altText: `Photo ${name}`,
  width: 1000,
  height: 1700,
}));

const PROCESSED: ProcessedImage = {
  blob: new Blob(["x"], { type: "image/webp" }),
  type: "image/webp",
  extension: "webp",
  width: 706,
  height: 1200,
};

function item(input: NewGalleryItem, index: number): AdminGalleryItem {
  return {
    id: `id-${index}`,
    imagePath: `${index}.webp`,
    imageUrl: null,
    altText: input.altText,
    width: input.image.width,
    height: input.image.height,
    sortOrder: index,
    published: input.consent,
    consentAt: input.consent ? "2030-01-15T09:00:00Z" : null,
    createdAt: "2030-01-15T09:00:00Z",
  };
}

function deps(failAt?: number): ShowcaseImportDeps & { added: NewGalleryItem[] } {
  const added: NewGalleryItem[] = [];
  return {
    added,
    load: vi.fn(async (photo: GalleryPhoto) => new File(["x"], photo.url, { type: "image/webp" })),
    process: vi.fn(async () => PROCESSED),
    add: vi.fn(async (input: NewGalleryItem) => {
      if (added.length === failAt) throw new Error("network");
      added.push(input);
      return item(input, added.length);
    }),
  };
}

describe("importShowcasePhotos", () => {
  it("importe chaque photo DANS L'ORDRE, traitée, avec son texte alternatif et l'accord", async () => {
    const d = deps();
    const progress: number[] = [];
    const result = await importShowcasePhotos(PHOTOS, {
      consent: true,
      onProgress: (done) => progress.push(done),
      deps: d,
    });

    expect(d.added.map((input) => input.altText)).toEqual(["Photo a", "Photo b", "Photo c"]);
    expect(d.added.every((input) => input.consent && input.image === PROCESSED)).toBe(true);
    // Chaque photo passe par le traitement (redimensionnement, aucune métadonnée).
    expect(d.process).toHaveBeenCalledTimes(3);
    expect(progress).toEqual([1, 2, 3]);
    expect(result.map((r) => r.published)).toEqual([true, true, true]);
  });

  it("coupure au milieu : erreur avec le nombre déjà importé, puis reprise sans doublon", async () => {
    const d = deps(1);
    const error = await importShowcasePhotos(PHOTOS, { consent: true, deps: d }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ShowcaseImportError);
    expect((error as ShowcaseImportError).done).toBe(1);

    // Reprise à partir de la 2e photo (la 1re est déjà dans la galerie).
    const retry = deps();
    await importShowcasePhotos(PHOTOS, { consent: true, from: 1, deps: retry });
    expect(retry.added.map((input) => input.altText)).toEqual(["Photo b", "Photo c"]);
  });

  it("photo illisible ou refusée par le traitement : arrêt propre sur cette photo", async () => {
    const d = deps();
    vi.mocked(d.process).mockRejectedValueOnce(new Error("invalid_file"));
    const error = await importShowcasePhotos(PHOTOS, { consent: true, deps: d }).catch(
      (e: unknown) => e,
    );
    expect((error as ShowcaseImportError).done).toBe(0);
    expect(d.add).not.toHaveBeenCalled();
  });
});

describe("resumeFrom", () => {
  it("saute les photos déjà présentes dans la galerie (réponse perdue lors de l'essai précédent)", () => {
    // La 2e photo a été créée côté base mais l'écran a cru à un échec (done = 1).
    expect(resumeFrom(PHOTOS, ["Photo a", "Photo b"], 1)).toBe(2);
  });

  it("ne recule jamais et s'arrête à la première photo absente", () => {
    expect(resumeFrom(PHOTOS, ["Photo c"], 1)).toBe(1);
    expect(resumeFrom(PHOTOS, ["Photo a", "Photo b", "Photo c"], 0)).toBe(3);
  });
});
