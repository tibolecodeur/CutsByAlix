import type { HTMLAttributes } from "react";
import { cx } from "@/lib/cx";

type CardProps = HTMLAttributes<HTMLElement> & {
  /** Balise rendue : `li` dans une liste, `article` pour un contenu autonome. */
  as?: "div" | "li" | "article";
};

/**
 * Carte blanche, lisible sur n'importe quelle section (blanche, rose pâle ou noire) : elle
 * remet le texte, les liens et le focus aux couleurs du fond clair.
 */
export function Card({ as: Tag = "div", className, ...props }: CardProps) {
  return (
    <Tag
      className={cx(
        "flex flex-col gap-2 border border-ink/15 bg-surface p-5 text-ink",
        "[--focus-ring:var(--color-ink)] [--link-color:var(--color-ink)] [--link-decoration:var(--color-accent)]",
        className,
      )}
      {...props}
    />
  );
}
