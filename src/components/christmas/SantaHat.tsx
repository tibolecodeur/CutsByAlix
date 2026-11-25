/**
 * Bonnet de Père Noël posé sur le logo du hero (Noël). Dessin SVG fixe, décoratif. Sa taille
 * suit celle du logo (em). Rouge, bord et pompon blancs : lisible sur la vidéo sombre.
 */
export function SantaHat() {
  return (
    <svg
      aria-hidden="true"
      data-testid="santa-hat"
      viewBox="0 0 120 100"
      className="pointer-events-none absolute -top-[0.42em] -left-[0.14em] w-[0.62em] -rotate-[18deg]"
    >
      <path d="M14 78 C 30 30, 70 6, 104 30 C 92 34, 84 46, 82 62 L 96 78 Z" fill="#C8102E" />
      <path
        d="M58 22 C 70 16, 88 18, 104 30 C 96 30, 90 34, 86 40 C 80 30, 70 24, 58 22 Z"
        fill="#9E0B24"
      />
      <rect x="6" y="72" width="96" height="20" rx="10" fill="#FFFFFF" />
      <circle cx="106" cy="32" r="11" fill="#FFFFFF" />
    </svg>
  );
}
