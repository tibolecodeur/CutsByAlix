/**
 * Bonnet de Père Noël posé sur le « C » du logo du hero (Noël). Dessin SVG fixe, décoratif.
 * La pointe et le pompon retombent à GAUCHE. Le bord en fourrure, centré sur le « C », repose
 * sur le haut de la lettre : contour gris pour le détacher du blanc, ombre serrée juste
 * dessous. Position et taille en em : elles suivent la taille du logo (choisies sur captures
 * le 2026-11-25). Aucun filtre ni flou.
 */
export function SantaHat() {
  return (
    <svg
      aria-hidden="true"
      data-testid="santa-hat"
      viewBox="-14 0 160 116"
      className="pointer-events-none absolute -top-[0.22em] left-[0.06em] z-10 w-[0.64em] -rotate-[6deg]"
    >
      {/* Ombre du bord sur le haut de la lettre (posée, pas flottante). */}
      <ellipse cx="74" cy="98" rx="54" ry="4" fill="rgb(0 0 0 / 0.45)" />
      {/* Corps du bonnet : la pointe part vers la gauche et retombe. */}
      <path
        d="M120 88 C 110 42, 74 10, 34 14 C 16 17, 6 30, 8 46 C 24 36, 38 40, 40 60 L 28 88 Z"
        fill="#c8102e"
      />
      {/* Pli sous la pointe, plus sombre. */}
      <path
        d="M66 18 C 48 10, 24 12, 12 28 C 10 34, 8 40, 8 46 C 20 32, 40 28, 56 34 Z"
        fill="#9e0b24"
      />
      {/* Reflet sur le tissu. */}
      <path
        d="M106 82 C 96 52, 78 32, 54 26"
        stroke="#e23a4f"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Bord en fourrure, légèrement bombé, posé sur la lettre. */}
      <path
        d="M20 84 C 46 76, 100 76, 128 84 C 132 86, 132 98, 128 100 C 100 94, 46 94, 20 100 C 15 98, 15 86, 20 84 Z"
        fill="#ffffff"
        // Fin contour gris : la fourrure blanche se détache de la lettre blanche.
        stroke="#c9c9c9"
        strokeWidth="2.5"
      />
      <path d="M28 89 C 56 84, 96 84, 120 89" stroke="#e6e6e6" strokeWidth="3" fill="none" />
      {/* Pompon, à gauche, au bout de la pointe. */}
      <circle cx="6" cy="52" r="12" fill="#ffffff" />
      <circle cx="2" cy="48" r="4" fill="#f1f1f1" />
    </svg>
  );
}
