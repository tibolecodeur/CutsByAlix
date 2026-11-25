/**
 * Bonnet de Noël posé sur la lettre « C » du logo du hero.
 *
 * Dessin redessiné en SVG d'après l'image fournie par Thibault (2026-11-25), retourné pour
 * que la pointe et le pompon retombent à GAUCHE comme sur son modèle de « C » : rouge lisse,
 * pli plus sombre sous la pointe, bord en fourrure crème en forme de croissant, pompon crème,
 * fin contour sombre. Le bord coiffe le sommet de la lettre.
 *
 * Utilisation : à placer DANS le `<span>` de la lettre « C » (position relative,
 * inline-block). Taille et position en `em` : elles suivent la taille de police du logo, donc
 * le bonnet reste calé sur la lettre à toutes les tailles d'écran. Légèrement incliné,
 * décoratif (aria-hidden), il ne capte ni clic ni doigt (pointer-events: none). SVG fixe.
 */
export function ChristmasHat() {
  return (
    <svg
      aria-hidden="true"
      data-testid="christmas-hat"
      viewBox="0 0 210 130"
      // Position et taille en em (voir plus haut), réglées sur captures.
      className="pointer-events-none absolute -top-[0.18em] -left-[0.06em] w-[0.68em] -rotate-[8deg]"
      stroke="#3b1d1d"
      strokeWidth="2.5"
      strokeLinejoin="round"
    >
      {/* Corps : dôme qui monte à droite, pointe qui retombe à gauche, derrière le bord. */}
      <path
        d="M196 74 C 196 38, 160 10, 112 10 C 74 10, 44 26, 28 50 C 18 66, 12 86, 12 104 L 26 104 C 30 90, 38 80, 52 74 Z"
        fill="#d31f35"
      />
      {/* Pli plus sombre sous la pointe. */}
      <path
        d="M44 36 C 32 50, 24 70, 22 96 C 30 80, 40 68, 56 60 C 50 52, 46 44, 44 36 Z"
        fill="#a50e25"
        stroke="none"
      />
      {/* Bord en fourrure : croissant crème, extrémités arrondies. */}
      <path
        d="M34 74 C 78 54, 152 50, 196 62 C 208 66, 208 88, 196 90 C 152 80, 80 84, 40 102 C 26 106, 18 80, 34 74 Z"
        fill="#fbe9dc"
      />
      {/* Ombre douce sous la fourrure (sans contour). */}
      <path
        d="M44 96 C 84 80, 150 76, 194 84"
        fill="none"
        stroke="#ecd2c0"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Pompon au bout de la pointe, à gauche, sous le bord. */}
      <circle cx="18" cy="112" r="14" fill="#fbe9dc" />
    </svg>
  );
}
