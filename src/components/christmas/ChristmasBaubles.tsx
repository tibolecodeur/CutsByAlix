import type { CSSProperties } from "react";

/**
 * Boules de Noël suspendues en haut des pages hors accueil (réserver, annuler, conditions,
 * pages légales, 404). Elles pendent à des fils de longueurs différentes et se balancent
 * doucement (rotation depuis le haut du fil : `transform` seulement, index.css
 * `bauble-swing`), avec quelques étoiles qui scintillent (`opacity`).
 *
 * Placées dans la marge haute de l'en-tête de page (à droite, au-dessus du titre) : elles ne
 * chevauchent jamais le titre. Décoratives : ni clic, ni doigt, ni lecteur d'écran.
 * Mouvements réduits : la règle globale arrête balancement et scintillement (boules immobiles).
 */

/** Teinte, reflet, longueur du fil (px), diamètre (px), durée du balancement (s). */
const BAUBLES = [
  { base: "#d62828", light: "#ff9c8f", string: 6, size: 34, duration: 3.4, delay: 0 },
  { base: "#f2b705", light: "#fff1b0", string: 16, size: 26, duration: 2.8, delay: -1.1 },
  { base: "#1e8e3e", light: "#9be3a8", string: 0, size: 30, duration: 3.1, delay: -0.6 },
] as const;

/** Étoiles dorées : position en % de la zone, taille (px), décalage du scintillement (s). */
const STARS = [
  { left: 8, top: 62, size: 12, delay: 0 },
  { left: 46, top: 78, size: 9, delay: -0.7 },
  { left: 88, top: 70, size: 11, delay: -1.3 },
] as const;

function Bauble({
  base,
  light,
  size,
  id,
}: {
  base: string;
  light: string;
  size: number;
  id: string;
}) {
  return (
    <svg width={size} height={size + 6} viewBox="0 0 40 46" className="block">
      <defs>
        <radialGradient id={id} cx="35%" cy="38%" r="70%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={base} />
          <stop offset="100%" stopColor={base} stopOpacity="0.8" />
        </radialGradient>
      </defs>
      {/* Attache métallique. */}
      <rect x="15" y="0" width="10" height="7" rx="1.5" fill="#c9c9c9" />
      <rect x="15" y="5" width="10" height="2" fill="#8f8f8f" />
      {/* Boule, reflet et frise. */}
      <circle cx="20" cy="26" r="19" fill={`url(#${id})`} />
      <path
        d="M3 24 C 12 30, 28 30, 37 24"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="2"
        fill="none"
      />
      <ellipse
        cx="13"
        cy="18"
        rx="4"
        ry="6"
        fill="#ffffff"
        fillOpacity="0.45"
        transform="rotate(-25 13 18)"
      />
    </svg>
  );
}

function Star({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="block">
      <path
        d="M12 0 L14.5 9.5 L24 12 L14.5 14.5 L12 24 L9.5 14.5 L0 12 L9.5 9.5 Z"
        fill="#f2b705"
      />
    </svg>
  );
}

export function ChristmasBaubles() {
  return (
    <div
      aria-hidden="true"
      data-testid="christmas-baubles"
      // Au-dessus du titre, aligné sur le bord droit de la colonne de contenu, dans la marge
      // haute de l'en-tête de page (sa hauteur exacte) : les boules ne touchent jamais le
      // titre. Les fils s'allongent sur desktop, où la marge est plus grande.
      className="pointer-events-none absolute right-0 bottom-full flex h-section w-36 items-start justify-end gap-4 md:h-section-lg md:w-44 md:[--bauble-extra:1.5rem]"
    >
      {STARS.map((star, index) => (
        <span
          key={index}
          className="christmas-star absolute"
          style={
            {
              left: `${star.left}%`,
              top: `${star.top}%`,
              "--twinkle-delay": `${star.delay}s`,
            } as CSSProperties
          }
        >
          <Star size={star.size} />
        </span>
      ))}
      {BAUBLES.map((bauble, index) => (
        <span
          key={index}
          className="bauble-swing flex flex-col items-center"
          style={
            {
              "--swing-duration": `${bauble.duration}s`,
              "--swing-delay": `${bauble.delay}s`,
            } as CSSProperties
          }
        >
          {/* Le fil. */}
          <span
            className="block w-px bg-ink/40"
            style={{ height: `calc(${bauble.string}px + var(--bauble-extra, 0px))` }}
          />
          <Bauble
            base={bauble.base}
            light={bauble.light}
            size={bauble.size}
            id={`bauble-${index}`}
          />
        </span>
      ))}
    </div>
  );
}
