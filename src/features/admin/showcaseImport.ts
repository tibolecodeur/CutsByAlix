import {
  addGalleryItem,
  type AdminGalleryItem,
  type NewGalleryItem,
} from "@/features/admin/gallery";
import type { GalleryPhoto } from "@/features/gallery/data";
import { processImage, type ProcessedImage } from "@/features/gallery/processImage";

/**
 * Import des photos de la vitrine (public/media/galerie/) dans la galerie GÉRÉE par l'admin.
 *
 * Chaque photo suit EXACTEMENT le parcours d'un ajout depuis le téléphone : traitement dans le
 * navigateur (`processImage` : type réel vérifié, 1200 px au plus, aucune métadonnée), envoi
 * dans le bucket privé, ligne créée par la fonction SQL `admin_add_gallery_item` (accord,
 * plafond, type du fichier). Aucun raccourci, aucun droit nouveau : seulement une boucle.
 *
 * Une photo à la fois et dans l'ordre : `admin_add_gallery_item` range chaque photo en
 * dernière position, l'ordre du site est donc conservé.
 */

export type ShowcaseImportDeps = {
  /** Lit le fichier de la vitrine sur notre propre domaine. */
  load: (photo: GalleryPhoto) => Promise<File>;
  process: (file: File) => Promise<ProcessedImage>;
  add: (input: NewGalleryItem) => Promise<AdminGalleryItem>;
};

/** Arrêt en cours de route : `done` photos sont déjà dans la galerie, on reprendra après. */
export class ShowcaseImportError extends Error {
  readonly done: number;
  constructor(done: number) {
    super("showcase_import_failed");
    this.name = "ShowcaseImportError";
    this.done = done;
  }
}

/** Délai par photo : en 4G instable, mieux vaut s'arrêter et proposer de reprendre. */
const LOAD_TIMEOUT_MS = 15_000;

async function loadFromOurDomain(photo: GalleryPhoto): Promise<File> {
  const response = await fetch(photo.url, { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error("load_failed");
  const blob = await response.blob();
  const name = photo.url.split("/").pop() ?? "photo.webp";
  return new File([blob], name, { type: blob.type || "image/webp" });
}

const DEFAULT_DEPS: ShowcaseImportDeps = {
  load: loadFromOurDomain,
  process: (file) => processImage(file),
  add: addGalleryItem,
};

type ImportOptions = {
  /**
   * Accord des personnes photographiées, confirmé par Alix : obligatoire (type `true`), comme
   * la case d'un ajout normal. Les photos sont publiées tout de suite.
   */
  consent: true;
  /** Reprise : nombre de photos déjà importées lors d'un essai précédent. */
  from?: number;
  /** Appelé après chaque photo importée, avec le total déjà fait (pour « 3 / 7 »). */
  onProgress?: (done: number) => void;
  deps?: ShowcaseImportDeps;
};

/** Importe `photos[from…]`, dans l'ordre. Lève `ShowcaseImportError` au premier échec. */
export async function importShowcasePhotos(
  photos: GalleryPhoto[],
  { consent, from = 0, onProgress, deps = DEFAULT_DEPS }: ImportOptions,
): Promise<AdminGalleryItem[]> {
  const imported: AdminGalleryItem[] = [];
  for (let index = from; index < photos.length; index++) {
    const photo = photos[index]!;
    try {
      const image = await deps.process(await deps.load(photo));
      imported.push(await deps.add({ image, altText: photo.altText, consent }));
    } catch {
      throw new ShowcaseImportError(index);
    }
    onProgress?.(index + 1);
  }
  return imported;
}

/**
 * Point de reprise après un échec : à partir de `done`, saute les photos dont le texte
 * alternatif existe déjà dans la galerie. Cas visé : la base a créé la ligne mais la réponse
 * s'est perdue (coupure 4G), l'écran a cru à un échec. Sans ce contrôle, la reprise
 * enverrait la même photo une seconde fois (revue sécurité).
 */
export function resumeFrom(
  photos: GalleryPhoto[],
  existingAltTexts: Iterable<string>,
  done: number,
): number {
  const existing = new Set(existingAltTexts);
  let from = done;
  while (from < photos.length && existing.has(photos[from]!.altText)) from++;
  return from;
}
