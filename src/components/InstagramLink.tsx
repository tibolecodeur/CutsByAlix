import { INSTAGRAM } from "@/lib/contact";

/**
 * Lien vers le compte Instagram d'Alix, dans un nouvel onglet.
 * `noopener` : la page Instagram ne peut pas piloter notre onglet (window.opener).
 * `noreferrer` : aucune URL de notre site n'est envoyée à Instagram. Le jeton d'annulation est
 * dans le fragment (#), que les navigateurs n'envoient jamais, mais on ne transmet rien du tout.
 * Lien seul sur sa ligne, en `min-h-tap` : zone tactile de 44 px.
 */
export function InstagramLink({
  label = `Écrire à @${INSTAGRAM.handle} sur Instagram`,
}: {
  /** Texte visible du lien (ex. « Voir les coupes sur Instagram » dans la galerie vide). */
  label?: string;
}) {
  return (
    <a
      href={INSTAGRAM.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link inline-flex min-h-tap items-center"
    >
      {/* Un seul enfant : dans un inline-flex, chaque enfant devient un élément flex et l'espace
          au bord de l'un d'eux disparaît (le lecteur d'écran lirait « Instagram(s'ouvre »). */}
      <span>
        {label} <span className="sr-only">(s'ouvre dans un nouvel onglet)</span>
      </span>
    </a>
  );
}
