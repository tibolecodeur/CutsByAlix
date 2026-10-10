type PageMetaProps = {
  /** Titre propre à la page ; le nom du site est ajouté automatiquement. */
  title?: string;
  description: string;
  /** Demande aux moteurs de recherche de ne pas indexer la page (pages privées). */
  noindex?: boolean;
  /**
   * N'envoie aucun en-tête Referer quand on quitte la page. À activer sur les pages dont
   * l'URL contient un secret (lien d'annulation) : sans cela, un lien sortant pourrait
   * transmettre l'adresse complète à un autre site.
   */
  noReferrer?: boolean;
};

const SITE_NAME = "CutsByAlix";

/**
 * Titre d'onglet et meta description de la page courante.
 * React 19 « hisse » lui-même <title> et <meta> dans le <head>, où qu'on les rende dans
 * l'arbre : pas besoin de librairie (react-helmet) pour ça. Les balises disparaissent avec la
 * page : `noindex` et `no-referrer` ne s'appliquent qu'à elle.
 */
export function PageMeta({
  title,
  description,
  noindex = false,
  noReferrer = false,
}: PageMetaProps) {
  return (
    <>
      <title>{title ? `${title} · ${SITE_NAME}` : SITE_NAME}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex" />}
      {noReferrer && <meta name="referrer" content="no-referrer" />}
    </>
  );
}
