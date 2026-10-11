import type { ComponentProps } from "react";
import { Link, type LinkProps } from "react-router";
import { cx } from "@/lib/cx";

type ButtonVariant = "primary" | "secondary";

/**
 * Pilule de 52 px minimum (docs/DESIGN.md). Le léger enfoncement au toucher n'utilise que
 * `transform`, et seulement si l'utilisateur accepte les animations (`motion-safe:`).
 */
const BASE_CLASS =
  "inline-flex min-h-button items-center justify-center gap-2 rounded-pill px-7 text-center font-semibold motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Rose pâle, texte noir (14,67). Le contour noir garde le bouton visible sur les sections
  // rose pâle (où son fond se confond) et sur le blanc : 14,67 et 18,88.
  primary: "border-2 border-ink bg-blush text-ink",
  // Contour et texte de la couleur courante : lisible sur fond clair comme sur bloc noir.
  secondary: "border-2 border-current bg-transparent",
};

type VariantProps = { variant?: ButtonVariant };

/** Bouton d'action (`<button>`), `type="button"` par défaut pour ne pas soumettre par erreur. */
export function Button({
  variant = "primary",
  type = "button",
  className,
  ...props
}: ComponentProps<"button"> & VariantProps) {
  return (
    <button type={type} className={cx(BASE_CLASS, VARIANT_CLASS[variant], className)} {...props} />
  );
}

/** Lien hors du site qui a l'apparence d'un bouton (`tel:`, `sms:`, `mailto:`). */
export function ButtonAnchor({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"a"> & VariantProps) {
  return <a className={cx(BASE_CLASS, VARIANT_CLASS[variant], className)} {...props} />;
}

/** Lien qui a l'apparence d'un bouton (navigation interne via React Router). */
export function ButtonLink({ variant = "primary", className, ...props }: LinkProps & VariantProps) {
  return <Link className={cx(BASE_CLASS, VARIANT_CLASS[variant], className)} {...props} />;
}
