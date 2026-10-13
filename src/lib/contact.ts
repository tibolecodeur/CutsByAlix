/**
 * Contact d'Alix : seule source de vérité pour le pseudo et le lien Instagram (consigne 24).
 * Le site ne stocke aucune adresse (ADR 0008) : le client la demande à Alix en message privé.
 */
export const INSTAGRAM = {
  handle: "CutsByAlix",
  url: "https://www.instagram.com/cutsbyalix/",
} as const;

/**
 * Formule unique pour le lieu du rendez-vous (consigne 27), sur l'accueil et à chaque étape
 * de /reserver : le site n'affiche que la localité, jamais l'adresse.
 */
export const LOCATION_NOTICE = "Lieu exact communiqué par DM sur Instagram, sur demande.";
