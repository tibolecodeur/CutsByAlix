import { adminClient, AdminError, REQUEST_TIMEOUT_MS, toAdminError } from "@/features/admin/data";
import { GALLERY_BUCKET, SIGNED_URL_TTL_S } from "@/features/gallery/data";
import type { ProcessedImage } from "@/features/gallery/processImage";
import { randomUuid } from "@/lib/uuid";

/**
 * Galerie côté admin (migration …_admin_galerie.sql, ADR 0006). Toutes les écritures passent
 * par les RPC `admin_*_gallery_*`, qui valident tout côté base ; le fichier, lui, passe par
 * l'API Storage (la base ne peut ni l'écrire ni l'effacer).
 *
 * Ordre imposé pour ne jamais laisser une ligne sans fichier (image cassée sur l'accueil) :
 * - ajout : fichier envoyé PUIS ligne créée ; si la ligne échoue, on efface le fichier ;
 * - suppression : ligne supprimée PUIS fichier effacé.
 * Si le réseau coupe entre les deux, il reste un fichier sans ligne, invisible du public :
 * `sweepGalleryOrphans` (appelée à l'ouverture de l'écran) les efface.
 *
 * Le nom du fichier est un uuid généré ici : jamais le nom d'origine (il peut contenir un
 * prénom, une date ou un lieu). La base refuse tout autre format.
 */

/** Limite de longueur du texte alternatif (même règle en base). */
export const MAX_ALT_TEXT_LENGTH = 200;

export type AdminGalleryItem = {
  id: string;
  /** URL signée de l'image (1 h) ; null si la signature a échoué (aperçu indisponible). */
  imageUrl: string | null;
  altText: string;
  width: number;
  height: number;
  sortOrder: number;
  published: boolean;
  /** Dernier accord confirmé (ISO) ; null si la photo n'a jamais été publiée. */
  consentAt: string | null;
  createdAt: string;
};

export type NewGalleryItem = {
  image: ProcessedImage;
  altText: string;
  /** Case « La personne photographiée est d'accord » cochée : publiée tout de suite. */
  consent: boolean;
};

type Row = {
  id: string;
  image_path: string;
  alt_text: string;
  width: number;
  height: number;
  sort_order: number;
  published: boolean;
  consent_at: string | null;
  created_at: string;
};

function toItem(row: Row, imageUrl: string | null): AdminGalleryItem {
  return {
    id: row.id,
    imageUrl,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order,
    published: row.published,
    consentAt: row.consent_at,
    createdAt: row.created_at,
  };
}

/** Texte alternatif nettoyé, ou `AdminError("invalid_input")` (la base revérifie). */
export function cleanAltText(altText: string): string {
  const cleaned = altText.trim();
  if (cleaned.length === 0 || cleaned.length > MAX_ALT_TEXT_LENGTH) {
    throw new AdminError("invalid_input");
  }
  return cleaned;
}

function storage() {
  return adminClient().storage.from(GALLERY_BUCKET);
}

/** URL signées par chemin ; une signature ratée donne simplement un aperçu absent. */
async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await storage().createSignedUrls(paths, SIGNED_URL_TTL_S);
  if (error) return new Map();
  return new Map(
    data.flatMap((entry) =>
      entry.path && entry.signedUrl && !entry.error ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
}

/** Toutes les photos (publiées et masquées), dans l'ordre d'affichage. */
export async function getAdminGallery(): Promise<AdminGalleryItem[]> {
  const { data, error } = await adminClient()
    .rpc("admin_list_gallery_items")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  const urls = await signedUrls(data.map((row) => row.image_path));
  return data.map((row) => toItem(row, urls.get(row.image_path) ?? null));
}

/** Envoie la photo DÉJÀ TRAITÉE (`processImage`) puis l'enregistre. */
export async function addGalleryItem(input: NewGalleryItem): Promise<AdminGalleryItem> {
  const altText = cleanAltText(input.altText);
  const path = `${randomUuid().toLowerCase()}.${input.image.extension}`;

  const upload = await storage().upload(path, input.image.blob, {
    contentType: input.image.type,
    // Jamais de remplacement : un nouveau nom par photo (la base l'interdit aussi).
    upsert: false,
    cacheControl: "3600",
  });
  // Message de Storage jamais recopié : il peut contenir le chemin ou des détails internes.
  if (upload.error) throw new AdminError("upload_failed");

  const { data, error } = await adminClient().rpc("admin_add_gallery_item", {
    p_image_path: path,
    p_alt_text: altText,
    p_width: input.image.width,
    p_height: input.image.height,
    p_consent: input.consent,
  });
  if (error) {
    // Pas de fichier sans ligne : on efface l'envoi (au pire, le ramassage s'en chargera).
    await storage()
      .remove([path])
      .catch(() => undefined);
    throw toAdminError(error);
  }
  const row = data[0];
  if (!row) throw new AdminError("unknown");
  return toItem(row, null);
}

/** Publier (l'accord doit être confirmé à chaque fois) ou masquer. */
export async function setGalleryItemPublished(
  id: string,
  published: boolean,
  consent: boolean,
): Promise<void> {
  const { error } = await adminClient().rpc("admin_set_gallery_item_published", {
    p_id: id,
    p_published: published,
    p_consent: consent,
  });
  if (error) throw toAdminError(error);
}

export async function updateGalleryItemAltText(id: string, altText: string): Promise<void> {
  const { error } = await adminClient().rpc("admin_update_gallery_item_alt", {
    p_id: id,
    p_alt_text: cleanAltText(altText),
  });
  if (error) throw toAdminError(error);
}

/** Monte ou descend d'une place ; `false` si la photo était déjà au bout. */
export async function moveGalleryItem(id: string, direction: "up" | "down"): Promise<boolean> {
  const { data, error } = await adminClient().rpc("admin_move_gallery_item", {
    p_id: id,
    p_direction: direction,
  });
  if (error) throw toAdminError(error);
  return data;
}

/**
 * Supprime la photo : la ligne (elle disparaît du site), puis le fichier. Un échec sur le
 * fichier n'est pas une erreur pour Alix : il sera ramassé par `sweepGalleryOrphans`.
 */
export async function deleteGalleryItem(id: string): Promise<void> {
  const { data: path, error } = await adminClient().rpc("admin_delete_gallery_item", {
    p_id: id,
  });
  if (error) throw toAdminError(error);
  await storage()
    .remove([path])
    .catch(() => undefined);
}

/**
 * Efface les fichiers sans ligne de plus d'1 h (envoi interrompu, suppression inachevée).
 * Au mieux : un échec ne gêne pas l'écran, on réessaiera à la prochaine ouverture.
 * Renvoie le nombre de fichiers effacés.
 */
export async function sweepGalleryOrphans(): Promise<number> {
  try {
    const { data, error } = await adminClient().rpc("admin_gallery_orphans");
    if (error || data.length === 0) return 0;
    const removed = await storage().remove(data);
    return removed.error ? 0 : removed.data.length;
  } catch {
    return 0;
  }
}
