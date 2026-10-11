import { getSupabase } from "@/lib/supabase";

/**
 * Galerie PUBLIQUE (section « Galerie » de l'accueil), lue en anonyme.
 *
 * - Table `gallery_items` : la RLS ne montre que les photos publiées, et anon ne lit que les
 *   colonnes d'affichage (chemin, texte alternatif, dimensions, ordre).
 * - Bucket « gallery » PRIVÉ : chaque photo s'affiche par une URL signée, valable
 *   `SIGNED_URL_TTL_S` secondes. Storage ne signe que les fichiers dont la ligne est publiée.
 *   Attention : la durée est choisie par l'appelant (n'importe qui peut demander une URL de
 *   plusieurs années pour une photo publiée). C'est pourquoi masquer une photo change le nom
 *   de son fichier (`hideGalleryItem`) : toutes les URL déjà émises meurent avec l'ancien.
 * - Une seule requête de signature pour toutes les photos.
 *
 * Gestion côté admin : `src/features/admin/gallery.ts`.
 */

export const GALLERY_BUCKET = "gallery";

/** Durée de validité d'une URL signée : 1 h (décision du 2026-10-11, ADR 0006). */
export const SIGNED_URL_TTL_S = 3600;

export type GalleryPhoto = {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
};

/** Au-delà, on abandonne : en 4G instable, mieux vaut un message qu'un chargement sans fin. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Photos publiées, dans l'ordre choisi par Alix, avec leur URL signée. Une photo dont l'URL
 * n'a pas pu être signée (dépubliée entre les deux requêtes) est simplement omise.
 * Rejette avec un message FIXE (jamais le texte brut de Supabase).
 */
export async function getPublishedGallery(): Promise<GalleryPhoto[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("gallery_items")
    .select("id, image_path, alt_text, width, height")
    .order("sort_order")
    .order("id")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw new Error("gallery_unavailable");
  if (data.length === 0) return [];

  const signed = await supabase.storage.from(GALLERY_BUCKET).createSignedUrls(
    data.map((row) => row.image_path),
    SIGNED_URL_TTL_S,
  );
  if (signed.error || !signed.data) throw new Error("gallery_unavailable");

  const urls = new Map(
    signed.data.flatMap((entry) =>
      entry.path && entry.signedUrl && !entry.error ? [[entry.path, entry.signedUrl] as const] : [],
    ),
  );
  return data.flatMap((row) => {
    const url = urls.get(row.image_path);
    return url
      ? [{ id: row.id, url, altText: row.alt_text, width: row.width, height: row.height }]
      : [];
  });
}
