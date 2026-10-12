import { ButtonLink } from "@/components/Button";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";

/**
 * URL inconnue. Cloudflare Pages sert `index.html` avec un statut 200 (repli SPA, pas de
 * `404.html` : décision de la consigne 22). Sans en-tête 404, c'est le `noindex` qui empêche
 * un moteur de recherche d'indexer ces pages (K-05 de l'audit).
 */
export function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page introuvable" description="Cette page n'existe pas." noindex />
      <Section variant="blush">
        <h1>Page introuvable</h1>
      </Section>
      <Section>
        <p>
          <ButtonLink to="/" variant="secondary">
            Retour à l'accueil
          </ButtonLink>
        </p>
      </Section>
    </>
  );
}
