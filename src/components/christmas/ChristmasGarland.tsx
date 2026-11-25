/**
 * Couleurs d'une guirlande classique (exception saisonnière à la palette, docs/DESIGN.md) :
 * [teinte de l'ampoule, reflet clair].
 */
const COLORS = [
  ["#d62828", "#ff9c8f"],
  ["#f2b705", "#fff1b0"],
  ["#1e8e3e", "#9be3a8"],
  ["#1f6feb", "#a9cbff"],
] as const;

/** Un feston : le fil pend entre deux attaches, deux ampoules accrochées dessus. */
const SWAG_WIDTH = 72;
/** Assez de festons pour un écran très large ; le surplus est coupé (overflow hidden). */
const SWAG_COUNT = 44;
/** Position (x, y) et inclinaison de chaque ampoule dans un feston, en suivant le fil. */
const BULBS_IN_SWAG = [
  { x: 20, y: 9.5, angle: 16 },
  { x: 52, y: 9.5, angle: -14 },
] as const;

/**
 * Guirlande de Noël sous l'en-tête : un fil vert foncé en festons et des ampoules brillantes
 * (reflet, douille, halo) qui scintillent. Seule l'OPACITÉ est animée (index.css,
 * `bulb-twinkle`) ; les halos sont des dégradés fixes, sans flou. Ampoules fixes si
 * l'utilisateur a demandé moins d'animations. Décorative, elle ne capte ni clic ni doigt.
 */
export function ChristmasGarland() {
  const width = SWAG_WIDTH * SWAG_COUNT;
  return (
    <div
      aria-hidden="true"
      data-testid="christmas-garland"
      className="pointer-events-none absolute inset-x-0 top-full h-9 overflow-hidden"
    >
      <svg width={width} height="36" viewBox={`0 0 ${width} 36`} className="block">
        <defs>
          {COLORS.map(([base, light], index) => (
            <g key={index}>
              {/* Reflet en haut à gauche : l'ampoule paraît en verre bombé. */}
              <radialGradient id={`bulb-${index}`} cx="35%" cy="30%" r="75%">
                <stop offset="0%" stopColor={light} />
                <stop offset="45%" stopColor={base} />
                <stop offset="100%" stopColor={base} stopOpacity="0.85" />
              </radialGradient>
              <radialGradient id={`glow-${index}`}>
                <stop offset="0%" stopColor={base} stopOpacity="0.55" />
                <stop offset="100%" stopColor={base} stopOpacity="0" />
              </radialGradient>
            </g>
          ))}
          <linearGradient id="bulb-cap" x1="0" x2="1">
            <stop offset="0%" stopColor="#8a8a8a" />
            <stop offset="50%" stopColor="#d9d9d9" />
            <stop offset="100%" stopColor="#7a7a7a" />
          </linearGradient>
        </defs>

        {Array.from({ length: SWAG_COUNT }, (_, swag) => {
          const x0 = swag * SWAG_WIDTH;
          return (
            <g key={swag} transform={`translate(${x0} 0)`}>
              {/* Le fil : une courbe qui pend entre deux attaches. */}
              <path
                d={`M0 3 Q${SWAG_WIDTH / 2} 22 ${SWAG_WIDTH} 3`}
                fill="none"
                stroke="#1d3b26"
                strokeWidth="1.6"
              />
              {BULBS_IN_SWAG.map((bulb, i) => {
                const index = swag * BULBS_IN_SWAG.length + i;
                const color = index % COLORS.length;
                return (
                  <g
                    key={i}
                    className="garland-bulb"
                    // Décalage du scintillement : les ampoules ne clignotent pas toutes ensemble.
                    style={{ animationDelay: `${-((index * 0.37) % 1.8)}s` }}
                    transform={`translate(${bulb.x} ${bulb.y}) rotate(${bulb.angle})`}
                  >
                    <circle cx="0" cy="11" r="11" fill={`url(#glow-${color})`} />
                    <rect x="-2.5" y="0" width="5" height="5" rx="1" fill="url(#bulb-cap)" />
                    <ellipse cx="0" cy="11.5" rx="4.6" ry="7" fill={`url(#bulb-${color})`} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
