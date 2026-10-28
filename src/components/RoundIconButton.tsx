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
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-button shrink-0 items-center justify-center rounded-pill border-2 border-current text-2xl motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.95] disabled:opacity-40"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
