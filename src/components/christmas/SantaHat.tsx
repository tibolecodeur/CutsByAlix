/**
 * Bonnet de Père Noël posé sur le « C » du logo du hero (Noël). Dessin SVG fixe, décoratif.
 * Sa taille suit celle du logo (em) ; le bord blanc mord sur le haut de la lettre pour que le
 * bonnet paraisse posé dessus, avec une ombre portée dessinée (aucun filtre).
 */
export function SantaHat() {
  return (
    <svg
      aria-hidden="true"
      data-testid="santa-hat"
      viewBox="0 0 140 110"
      className="pointer-events-none absolute -top-[0.36em] -left-[0.16em] z-10 w-[0.78em] -rotate-[14deg]"
    >
      {/* Ombre du bord sur la lettre. */}
      <ellipse cx="62" cy="98" rx="54" ry="7" fill="rgb(0 0 0 / 0.28)" />
      {/* Corps du bonnet, pointe retombant à droite, pli plus sombre. */}
      <path
        d="M16 86 C 26 40, 62 8, 102 14 C 120 17, 130 30, 128 44 C 112 34, 98 40, 96 60 L 110 86 Z"
        fill="#c8102e"
      />
      <path
        d="M70 18 C 88 10, 112 12, 124 28 C 126 34, 128 38, 128 44 C 116 30, 96 26, 80 32 Z"
        fill="#9e0b24"
      />
      <path
        d="M30 80 C 40 50, 60 30, 84 24"
        stroke="#e23a4f"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bord en fourrure (posé sur la lettre) et pompon. */}
      <rect x="6" y="78" width="112" height="22" rx="11" fill="#ffffff" />
      <path d="M14 84 h96" stroke="#e6e6e6" strokeWidth="3" strokeLinecap="round" />
      <circle cx="127" cy="48" r="12" fill="#ffffff" />
      <circle cx="123" cy="45" r="4" fill="#f1f1f1" />
    </svg>
  );
}
