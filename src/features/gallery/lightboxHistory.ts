/**
 * Entrée d'historique de la vue agrandie : le bouton « retour » du téléphone (Android, geste
 * de retour d'iPhone) ferme la photo au lieu de quitter la page.
 *
 * On ajoute une entrée à la MÊME adresse, en gardant l'état de React Router (`...state`) :
 * pour le routeur, rien ne change de page. Fermer la vue revient en arrière d'un cran
 * (`history.back()`), ce qui retire l'entrée ; l'événement `popstate` déclenche la fermeture.
 * Chaque ouverture a son propre jeton : une ancienne entrée retrouvée dans l'historique
 * (bouton « suivant » du navigateur) n'est jamais prise pour celle de la vue ouverte.
 */

const KEY = "cutsGalleryLightbox";

function currentState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return state && typeof state === "object" ? (state as Record<string, unknown>) : {};
}

/** À appeler au toucher de la vignette, avant d'ouvrir la vue (jamais dans un effet). */
export function pushLightboxEntry(): string {
  const token = `${Date.now()}-${Math.random()}`;
  window.history.pushState({ ...currentState(), [KEY]: token }, "");
  return token;
}

/** Vrai tant que l'entrée ajoutée à l'ouverture `token` est l'entrée courante de l'historique. */
export function isLightboxEntry(token: string): boolean {
  return currentState()[KEY] === token;
}
