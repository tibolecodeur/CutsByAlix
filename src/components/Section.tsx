import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type SectionVariant = "paper" | "ink";

/**
 * Fonds de base, contrastes dans docs/DESIGN.md :
 * - `paper` : blanc cassé #F7F7F5 (pages outil), texte noir (17,6), gris secondaire (6,2),
 *   liens rose foncé (5,48).
 * - `ink` : noir #111111 (vitrine), texte blanc (18,9), liens rose pâle (14,67), focus blanc.
 *   Ni gris secondaire ni rose foncé en texte.
 */
const VARIANT_CLASS: Record<SectionVariant, string> = {
  paper: "bg-paper text-ink",
  ink: "bg-ink text-white [--focus-ring:var(--color-white)] [--link-color:var(--color-blush)]",
};

type SectionProps = ComponentProps<"section"> & {
  variant?: SectionVariant;
  /**
   * Sections de la vitrine : beaucoup plus d'air, et colonne large sur desktop (64 rem au lieu
   * de 48) pour la galerie et les grands titres. L'admin et les formulaires restent serrés.
   */
  roomy?: boolean;
  /** Halos décoratifs (<Glow />), posés derrière le contenu et rognés aux bords de la section. */
  glows?: ReactNode;
};

/** Bande pleine largeur ; le contenu est centré et borné en largeur. */
export function Section({
  variant = "paper",
  roomy = false,
  glows,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cx(
        roomy ? "py-section-roomy md:py-section-roomy-lg" : "py-section md:py-section-lg",
        // `isolate` : les halos (-z-10) restent dans la section ; `overflow-clip` les rogne
        // sans créer de zone de défilement (contrairement à overflow-hidden, rien à faire
        // défiler par erreur au doigt).
        glows !== undefined && "relative isolate overflow-clip",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    >
      {glows}
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

type GlowProps = {
  /** Teinte du halo : orange (dominante) ou rose foncé (secondaire). */
  tone: "orange" | "rose";
  /**
   * Position et taille, en classes Tailwind (ex. « top-0 -right-32 size-[28rem] »). Ancrer en
   * haut, en bas ou au centre (top-1/2 -translate-y-1/2) : avec `max-h-full`, le halo tient
   * alors entier dans la section et n'est jamais coupé net à un bord (couture visible).
   * Règle de contraste : jamais de chiffres orange sur un halo orange (2,63) ; sur un halo
   * rose, ils restent à 3,69 au pire (grand texte, AA 3).
   */
  className: string;
};

const GLOW_COLOR: Record<GlowProps["tone"], string> = {
  orange: "rgb(255 106 26 / 0.45)",
  rose: "rgb(194 24 91 / 0.5)",
};

/**
 * Halo flou : un simple dégradé radial (aucun `filter: blur`), donc gratuit pour le GPU,
 * statique, sans animation. Décoratif (aria-hidden), il ne reçoit aucun toucher.
 */
export function Glow({ tone, className }: GlowProps) {
  return (
    <div
      aria-hidden="true"
      className={cx("pointer-events-none absolute -z-10 max-h-full rounded-full", className)}
      style={{
        backgroundImage: `radial-gradient(closest-side, ${GLOW_COLOR[tone]}, transparent)`,
      }}
    />
  );
}
