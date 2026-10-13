import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type SectionVariant = "plain" | "ink";

/**
 * Fond de chaque variante, conforme au tableau de contrastes de docs/DESIGN.md.
 * - `plain` : transparente, elle laisse voir le fond continu de la page (`bg-flow`, posé sur
 *   <main> par Layout). Aucune section claire ne peint son propre fond : pas de coupure.
 * - `ink` : bloc noir qui entre et sort par un fondu orange (`bg-dusk`). Les marges haute et
 *   basse s'allongent de la hauteur du fondu : le contenu commence toujours sur le noir plein.
 *   Texte blanc, liens rose pâle soulignés, focus blanc. Ni gris ni rose foncé.
 */
const VARIANT_CLASS: Record<SectionVariant, string> = {
  plain: "py-section text-ink md:py-section-lg",
  ink: "bg-dusk py-[calc(var(--dusk)+var(--spacing-section))] text-white [--focus-ring:var(--color-white)] [--link-color:var(--color-blush)] [--link-decoration:var(--color-blush)] md:py-[calc(var(--dusk)+var(--spacing-section-lg))]",
};

type SectionProps = ComponentProps<"section"> & { variant?: SectionVariant };

/** Bande pleine largeur ; le contenu est centré et borné en largeur. */
export function Section({ variant = "plain", className, children, ...props }: SectionProps) {
  return (
    <section className={cx(VARIANT_CLASS[variant], className)} {...props}>
      <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-safe">{children}</div>
    </section>
  );
}
