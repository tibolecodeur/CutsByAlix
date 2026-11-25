/**
 * Bonnet de Noël posé sur la lettre « C » du logo du hero.
 *
 * Utilisation : à placer DANS le `<span>` de la lettre « C » (position relative,
 * inline-block). Le bonnet est en `position: absolute`, avec une taille et une position en
 * `em` : elles suivent la taille de police du logo, donc il reste calé sur la lettre à toutes
 * les tailles d'écran. Incliné d'environ -9°, décoratif (aria-hidden), il ne capte ni clic ni
 * doigt (pointer-events: none). Dessin SVG fixe, sans animation ni filtre.
 *
 * Volume : dégradés sur le tissu rouge (côté éclairé à droite, ombre à gauche et dans le pli),
 * fourrure et pompon en dégradé radial avec petites touffes pour la texture, et une ombre
 * douce sous le bord, qui tombe sur la lettre pour qu'il ait l'air réellement posé.
 */
export function ChristmasHat() {
  return (
    <svg
      aria-hidden="true"
      data-testid="christmas-hat"
      viewBox="0 0 200 170"
      // Taille et position en em (voir plus haut). left décalé à droite : compense l'italique
      // du logo pour centrer le bonnet sur le sommet du « C ». -9° : épouse la courbe.
      className="pointer-events-none absolute -top-[0.27em] left-[0.1em] w-[0.6em] -rotate-[9deg]"
    >
      <defs>
        {/* Tissu : clair à droite (lumière), foncé à gauche. */}
        <linearGradient id="hat-cloth" x1="1" y1="0" x2="0" y2="0.3">
          <stop offset="0%" stopColor="#ec3a4f" />
          <stop offset="45%" stopColor="#c8102e" />
          <stop offset="100%" stopColor="#7f0a1c" />
        </linearGradient>
        {/* Pli sous la pointe, dans l'ombre. */}
        <linearGradient id="hat-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6d0817" />
          <stop offset="100%" stopColor="#a30c24" />
        </linearGradient>
        {/* Fourrure et pompon : blanc au centre, gris doux sur les bords (volume). */}
        <radialGradient id="hat-fur" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="65%" stopColor="#f1f1f1" />
          <stop offset="100%" stopColor="#c7c7c7" />
        </radialGradient>
        <radialGradient id="hat-pompom" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#ececec" />
          <stop offset="100%" stopColor="#bdbdbd" />
        </radialGradient>
        {/* Ombre portée douce (dégradé, aucun flou). */}
        <radialGradient id="hat-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ombre portée sur le haut de la lettre. */}
      <ellipse cx="104" cy="152" rx="82" ry="13" fill="url(#hat-shadow)" />

      {/* Corps du bonnet : monte vers la droite puis la pointe retombe à gauche. */}
      <path
        d="M176 136 C 172 84, 140 32, 92 24 C 62 19, 38 32, 30 58 C 48 48, 68 54, 76 74 C 70 92, 60 114, 44 136 Z"
        fill="url(#hat-cloth)"
      />
      {/* Pli et dessous de la pointe. */}
      <path d="M30 58 C 48 48, 68 54, 76 74 C 66 66, 48 62, 36 70 Z" fill="url(#hat-fold)" />
      {/* Reflet sur le tissu. */}
      <path
        d="M156 120 C 150 84, 128 52, 98 40"
        stroke="#ff7a8a"
        strokeOpacity="0.55"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Bord en fourrure : contour en festons, pour un aspect moelleux. */}
      <path
        d="M30 128 C 30 118, 42 114, 52 118 C 60 110, 74 110, 82 116 C 92 108, 108 108, 116 116
           C 126 108, 142 110, 148 118 C 158 112, 174 116, 178 126 C 188 130, 188 146, 176 150
           C 168 158, 152 158, 144 152 C 134 160, 116 160, 108 152 C 98 160, 80 160, 72 152
           C 62 158, 44 158, 38 150 C 26 148, 22 134, 30 128 Z"
        fill="url(#hat-fur)"
        stroke="#bdbdbd"
        strokeOpacity="0.7"
        strokeWidth="1.5"
      />
      {/* Texture de la fourrure : petites touffes claires et ombrées. */}
      <g fill="#ffffff" fillOpacity="0.9">
        <circle cx="56" cy="128" r="6" />
        <circle cx="86" cy="126" r="7" />
        <circle cx="118" cy="127" r="6.5" />
        <circle cx="150" cy="129" r="6" />
      </g>
      <g fill="#d4d4d4" fillOpacity="0.8">
        <circle cx="70" cy="143" r="4" />
        <circle cx="102" cy="144" r="4.5" />
        <circle cx="134" cy="143" r="4" />
        <circle cx="164" cy="141" r="3.5" />
        <circle cx="42" cy="140" r="3.5" />
      </g>

      {/* Pompon au bout de la pointe, à gauche. */}
      <circle cx="26" cy="66" r="20" fill="url(#hat-pompom)" />
      <g fill="#ffffff" fillOpacity="0.85">
        <circle cx="18" cy="58" r="5" />
        <circle cx="30" cy="56" r="4" />
      </g>
      <g fill="#cfcfcf" fillOpacity="0.8">
        <circle cx="34" cy="76" r="3.5" />
        <circle cx="18" cy="74" r="3" />
      </g>
    </svg>
  );
}
