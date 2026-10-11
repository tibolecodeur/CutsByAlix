import { AdminError } from "@/features/admin/data";
import { MAX_ALT_TEXT_LENGTH } from "@/features/admin/gallery";
import { ImageError } from "@/features/gallery/processImage";

/** Messages des erreurs de la galerie admin, par code stable (jamais le texte de Supabase). */
const MESSAGES: Record<string, string> = {
  // Traitement de la photo dans le navigateur (ImageError).
  invalid_file: "Ce fichier n'est pas une photo JPEG, PNG ou WebP lisible. Choisis-en une autre.",
  file_too_large: "Photo trop lourde, même réduite. Choisis-en une autre.",
  processing_failed:
    "Le téléphone n'a pas réussi à préparer la photo. Réessaie, ou choisis-en une autre.",
  // Base et Storage (AdminError).
  invalid_input: `Texte alternatif obligatoire, ${MAX_ALT_TEXT_LENGTH} caractères maximum, sans < > ni ".`,
  gallery_limit_reached: "La galerie est pleine : supprime d'anciennes photos pour en ajouter.",
  consent_required: "Coche l'accord de la personne photographiée pour publier.",
  upload_failed:
    "La photo n'a pas pu être envoyée. Vérifie ta connexion, puis réessaie. Si la galerie est pleine, supprime d'anciennes photos.",
  not_found: "Cette photo n'existe plus. Recharge la page.",
  forbidden: "Accès refusé. Reconnecte-toi, puis réessaie.",
};

const FALLBACK = "L'action n'a pas pu être enregistrée. Vérifie ta connexion, puis réessaie.";

export function galleryErrorMessage(caught: unknown): string {
  if (caught instanceof ImageError || caught instanceof AdminError) {
    return MESSAGES[caught.code] ?? FALLBACK;
  }
  return FALLBACK;
}
