import type { Ref } from "react";

type RoundIconButtonProps = {
  label: string;
  glyph: string;
  disabled?: boolean;
  onClick: () => void;
  /** React 19 : `ref` est une prop comme une autre (plus besoin de forwardRef). */
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Bouton rond de 52 px, contour de la couleur du texte ; le symbole est décoratif, le nom
 * vient de `label`. Partagé par le carrousel de la galerie et sa vue agrandie.
 *
 * Inactif = `aria-disabled` (et non `disabled`) : un bouton `disabled` qui a le focus le
 * perd (il repart au début de la page) ; avec `aria-disabled`, il le garde, reste annoncé
 * comme inactif, et le clic est simplement ignoré.
 */
export function RoundIconButton({
  label,
  glyph,
  disabled = false,
  onClick,
  ref,
}: RoundIconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className="inline-flex size-button shrink-0 items-center justify-center rounded-pill border-2 border-current text-2xl motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.95] aria-disabled:opacity-40 aria-disabled:active:scale-100"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
