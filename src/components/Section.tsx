import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type SectionVariant = "paper" | "ink";

/**
 * Fonds UNIS, en alternance blanc cassé / noir, transitions nettes (aucun dégradé) :
 * - `paper` : blanc cassé #F7F7F5, texte noir (17,6), gris secondaire autorisé (6,2).
 * - `ink` : noir #111111, texte blanc (18,9), liens blancs soulignés d'orange, focus blanc,
 *   grands chiffres orange autorisés (6,59). Ni gris secondaire ni rose foncé.
 * Contrastes : docs/DESIGN.md.
 */
const VARIANT_CLASS: Record<SectionVariant, string> = {
  paper: "bg-paper text-ink",
  ink: "bg-ink text-white [--focus-ring:var(--color-white)] [--link-color:var(--color-white)]",
};

type SectionProps = ComponentProps<"section"> & {
  variant?: SectionVariant;
  /**
   * Sections de la vitrine : beaucoup plus d'air, et colonne large sur desktop (64 rem au lieu
   * de 48) pour la galerie et les grands titres. L'admin et les formulaires restent serrés.
   */
  roomy?: boolean;
};

/** Bande pleine largeur ; le contenu est centré et borné en largeur. */
export function Section({
  variant = "paper",
  roomy = false,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cx(
        roomy ? "py-section-roomy md:py-section-roomy-lg" : "py-section md:py-section-lg",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    >
      <div
        className={cx(
          "mx-auto flex w-full flex-col gap-6 px-safe",
          roomy ? "max-w-content-wide" : "max-w-content",
        )}
      >
        {children}
      </div>
    </section>
  );
}
