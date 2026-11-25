import type { CSSProperties } from "react";

/**
 * Couleurs d'une guirlande classique (exception saisonnière à la palette, docs/DESIGN.md) :
 * teinte de l'ampoule, reflet clair, et décalage du scintillement de chaque couleur.
 */
const COLORS = [
  { base: "#d62828", light: "#ff9c8f", delay: 0 },
  { base: "#f2b705", light: "#fff1b0", delay: -0.45 },
  { base: "#1e8e3e", light: "#9be3a8", delay: -0.9 },
  { base: "#1f6feb", light: "#a9cbff", delay: -1.35 },
] as const;

/** Un feston : le fil pend entre deux attaches, deux ampoules accrochées dessus. */
const SWAG_WIDTH = 72;
/** Festons dessinés : 44 × 72 px couvrent un écran de 3 000 px ; le surplus est coupé. */
const SWAG_COUNT = 44;
const WIDTH = SWAG_WIDTH * SWAG_COUNT;
const HEIGHT = 36;
/** Position (x, y) et inclinaison de chaque ampoule dans un feston, posée sur le fil. */
const BULBS_IN_SWAG = [
  { x: 20, y: 9.5, angle: 16 },
  { x: 52, y: 9.5, angle: -14 },
] as const;

type Bulb = { key: string; x: number; y: number; angle: number; color: number };

const BULBS: Bulb[] = Array.from({ length: SWAG_COUNT }).flatMap((_, swag) =>
  BULBS_IN_SWAG.map((bulb, i) => ({
    key: `${swag}-${i}`,
    x: swag * SWAG_WIDTH + bulb.x,
    y: bulb.y,
    angle: bulb.angle,
    color: (swag * BULBS_IN_SWAG.length + i) % COLORS.length,
  })),
);

const SVG_PROPS = {
  width: WIDTH,
  height: HEIGHT,
  viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
  className: "absolute top-0 left-0 block",
} as const;

/**
 * Guirlande de Noël sous l'en-tête : un fil vert foncé en festons et des ampoules brillantes
 * (reflet, douille, halo dessinés en dégradés, sans flou).
 *
 * Performance mobile (revue design du 2026-11-25) : le dessin est FIXE. Un calque porte le fil
 * et les douilles ; chaque couleur a son propre calque, et seule l'OPACITÉ de ces 4 calques
 * HTML est animée (index.css, `garland-layer`). Le navigateur les confie à la carte
 * graphique : rien n'est redessiné pendant le scintillement. Calques fixes si l'utilisateur a
 * demandé moins d'animations. Décorative : ni clic, ni doigt, ni lecteur d'écran.
 */
export function ChristmasGarland() {
  return (
    <div
      aria-hidden="true"
      data-testid="christmas-garland"
      className="pointer-events-none absolute inset-x-0 top-full h-9 overflow-hidden"
    >
      <svg {...SVG_PROPS}>
        <defs>
          <linearGradient id="garland-cap" x1="0" x2="1">
            <stop offset="0%" stopColor="#8a8a8a" />
            <stop offset="50%" stopColor="#d9d9d9" />
            <stop offset="100%" stopColor="#7a7a7a" />
          </linearGradient>
        </defs>
        {Array.from({ length: SWAG_COUNT }, (_, swag) => (
          <path
            key={swag}
            d={`M${swag * SWAG_WIDTH} 3 q${SWAG_WIDTH / 2} 19 ${SWAG_WIDTH} 0`}
            fill="none"
            stroke="#1d3b26"
            strokeWidth="1.6"
          />
        ))}
        {BULBS.map((bulb) => (
          <rect
            key={bulb.key}
            x="-2.5"
            y="0"
            width="5"
            height="5"
            rx="1"
            fill="url(#garland-cap)"
            transform={`translate(${bulb.x} ${bulb.y}) rotate(${bulb.angle})`}
          />
        ))}
      </svg>

      {COLORS.map((color, colorIndex) => (
        <div
          key={colorIndex}
          className="garland-layer absolute inset-0"
          style={{ "--twinkle-delay": `${color.delay}s` } as CSSProperties}
        >
          <svg {...SVG_PROPS}>
            <defs>
              {/* Reflet en haut à gauche : l'ampoule paraît en verre bombé. */}
              <radialGradient id={`garland-bulb-${colorIndex}`} cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor={color.light} />
                <stop offset="45%" stopColor={color.base} />
                <stop offset="100%" stopColor={color.base} stopOpacity="0.85" />
              </radialGradient>
              <radialGradient id={`garland-glow-${colorIndex}`}>
                <stop offset="0%" stopColor={color.base} stopOpacity="0.55" />
                <stop offset="100%" stopColor={color.base} stopOpacity="0" />
              </radialGradient>
            </defs>
            {BULBS.filter((bulb) => bulb.color === colorIndex).map((bulb) => (
              <g key={bulb.key} transform={`translate(${bulb.x} ${bulb.y}) rotate(${bulb.angle})`}>
                <circle cx="0" cy="11" r="11" fill={`url(#garland-glow-${colorIndex})`} />
                <ellipse
                  cx="0"
                  cy="11.5"
                  rx="4.6"
                  ry="7"
                  fill={`url(#garland-bulb-${colorIndex})`}
                />
              </g>
            ))}
          </svg>
        </div>
      ))}
    </div>
  );
}
