import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type SectionVariant = "white" | "blush";

/**
 * Fonds, contrastes dans docs/DESIGN.md :
 * - `white` : fond de toutes les pages. Texte noir (18,9), gris secondaire (6,7), liens rose
 *   foncé (5,9).
 * - `blush` : bande rose pâle, UNE par page au plus (la galerie de l'accueil). Texte noir
 *   (14,7), gris (5,2), liens rose foncé en gras (4,56, AA de justesse).
 */
const VARIANT_CLASS: Record<SectionVariant, string> = {
  white: "bg-paper text-ink",
  blush: "bg-blush text-ink [--link-weight:700]",
};

type SectionProps = ComponentProps<"section"> & {
  variant?: SectionVariant;
  /**
   * Sections de la vitrine : plus d'air, et colonne large sur desktop (64 rem au lieu de 48)
   * pour la galerie et les grands titres. Formulaires, pages légales et admin restent serrés.
   */
  roomy?: boolean;
};

/** Bande pleine largeur ; le contenu est centré et borné en largeur. */
export function Section({
  variant = "white",
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

/** Courte bande « poteau de barbier » sous un titre : la signature du site. */
export function BarberStripe({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("bg-barber block h-2 w-20 rounded-pill", className)} />
  );
}

type PageHeaderProps = {
  title: string;
  /** Une phrase sous le titre (facultative). */
  lead?: ReactNode;
};

/**
 * En-tête commun des pages hors accueil (réserver, annuler, pages légales, 404) : grand titre
 * condensé, bande de barbier, phrase d'accroche. Même gabarit partout = repères stables.
 */
export function PageHeader({ title, lead }: PageHeaderProps) {
  return (
    <Section className="pb-8 md:pb-10">
      <h1>{title}</h1>
      <BarberStripe />
      {lead && <p className="max-w-[60ch] text-lg">{lead}</p>}
    </Section>
  );
}
