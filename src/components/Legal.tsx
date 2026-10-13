import type { ReactNode } from "react";

/**
 * Briques des pages légales (mentions légales, politique de confidentialité).
 *
 * `ToComplete` marque une information que Thibault / Alix doivent remplir eux-mêmes (nom,
 * adresse, SIRET…). Rien n'est inventé : tant qu'un de ces marqueurs reste visible, la page
 * n'est pas prête pour la mise en ligne. Repérage rapide : chercher « À COMPLÉTER » dans src/.
 */
export function ToComplete({ children }: { children: ReactNode }) {
  return (
    <mark className="bg-orange/25 px-1 font-semibold text-ink [box-decoration-break:clone]">
      [À COMPLÉTER : {children}]
    </mark>
  );
}

/** Une rubrique : titre de niveau 2, puis paragraphes ou listes, en largeur de lecture. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex max-w-[65ch] flex-col gap-3 border-t border-ink/10 pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-3xl">{title}</h2>
      {children}
    </section>
  );
}

/** Liste à puces sobre, pour les énumérations (données, droits…). */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>;
}
