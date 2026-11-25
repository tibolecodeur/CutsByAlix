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
      className="pointer-events-none absolute -top-[0.12em] -left-[0.1em] w-[0.68em] -rotate-[8deg]"
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
      {/* Texture de la fourrure : petites mèches ombrées et touches de lumière, dans le sens du
          croissant (sans contour). */}
      <g stroke="none">
        <g fill="#e9d0bb">
          <ellipse cx="56" cy="88" rx="5" ry="2.4" transform="rotate(-24 56 88)" />
          <ellipse cx="82" cy="78" rx="5.5" ry="2.4" transform="rotate(-16 82 78)" />
          <ellipse cx="110" cy="80" rx="5" ry="2.2" transform="rotate(-8 110 80)" />
          <ellipse cx="136" cy="70" rx="5.5" ry="2.4" transform="rotate(-6 136 70)" />
          <ellipse cx="164" cy="74" rx="5" ry="2.2" transform="rotate(2 164 74)" />
          <ellipse cx="188" cy="72" rx="4.5" ry="2" transform="rotate(8 188 72)" />
          <ellipse cx="68" cy="92" rx="3.5" ry="1.8" transform="rotate(-20 68 92)" />
          <ellipse cx="124" cy="84" rx="3.5" ry="1.8" transform="rotate(-6 124 84)" />
          <ellipse cx="178" cy="84" rx="3.5" ry="1.8" transform="rotate(6 178 84)" />
        </g>
        <g fill="#ffffff" fillOpacity="0.85">
          <ellipse cx="48" cy="78" rx="5" ry="2.2" transform="rotate(-26 48 78)" />
          <ellipse cx="96" cy="68" rx="6" ry="2.4" transform="rotate(-12 96 68)" />
          <ellipse cx="150" cy="62" rx="6" ry="2.4" transform="rotate(-2 150 62)" />
          <ellipse cx="190" cy="64" rx="4" ry="2" transform="rotate(10 190 64)" />
        </g>
      </g>
      {/* Pompon au bout de la pointe, à gauche, sous le bord, avec sa texture duveteuse. */}
      <circle cx="18" cy="112" r="14" fill="#fbe9dc" />
      <g stroke="none">
        <g fill="#e9d0bb">
          <circle cx="24" cy="120" r="3" />
          <circle cx="13" cy="121" r="2.4" />
          <circle cx="28" cy="111" r="2.2" />
          <circle cx="19" cy="114" r="1.8" />
        </g>
        <g fill="#ffffff" fillOpacity="0.9">
          <circle cx="12" cy="105" r="3.4" />
          <circle cx="20" cy="103" r="2.2" />
          <circle cx="9" cy="112" r="1.8" />
        </g>
      </g>
    </svg>
  );
}
