import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Boules de Noël des pages hors accueil (réserver, annuler, conditions, pages légales, 404),
 * ACCROCHÉES À LA GUIRLANDE de l'en-tête : chaque fil part du point le plus bas d'un feston
 * de la guirlande (entre deux ampoules) et descend dans la marge haute de la page, au-dessus du
 * titre (jamais dessus). Quelques étoiles dorées scintillent autour.
 *
 * Mouvement naturel : chaque boule se balance de gauche à droite avec sa propre amplitude, sa
 * propre durée et son propre point de départ (index.css `bauble-swing`, rotation depuis le
 * haut du fil : `transform` seulement). Elles ne vont donc jamais toutes du même côté.
 * Mouvements réduits : la règle globale les arrête (boules immobiles).
 *
 * Décoratives : ni clic, ni doigt, ni lecteur d'écran.
 */

/** Géométrie de la guirlande (ChristmasGarland) : un feston tous les 72 px, depuis le bord
 *  gauche de l'écran ; son point le plus bas est au milieu, 12,5 px sous le haut de la
 *  guirlande, qui mesure 36 px (2,25 rem) et finit pile en haut de la page. */
const SWAG_WIDTH = 72;
const WIRE_LOW_X = 36;
const WIRE_ABOVE_PAGE = 36 - 12.5;

/** Teinte, reflet, fil (px), diamètre (px), amplitude (°), durée (s), décalage (s). */
const BAUBLES = [
  { base: "#d62828", light: "#ff9c8f", string: 14, size: 34, amp: 6, duration: 3.6, delay: -0.4 },
  { base: "#f2b705", light: "#fff1b0", string: 30, size: 26, amp: 8, duration: 2.9, delay: -2.1 },
  { base: "#1e8e3e", light: "#9be3a8", string: 6, size: 30, amp: 5, duration: 3.3, delay: -1.2 },
] as const;

/** Étoiles dorées : position (px) par rapport à la première boule, taille, décalage (s). */
const STARS = [
  { dx: -34, top: 62, size: 12, delay: 0 },
  { dx: 40, top: 86, size: 9, delay: -0.7 },
  { dx: 176, top: 70, size: 11, delay: -1.3 },
] as const;

/** Placement par défaut (écran de 375 px) avant la mesure, et dans les tests (jsdom). */
const DEFAULT_ANCHORS = [180, 252, 324];

/**
 * Points d'accroche : les 3 derniers points bas de feston qui tombent dans la colonne de
 * contenu (bord droit du titre), pour que les boules restent au-dessus du texte de la page.
 */
function anchorsFor(columnRight: number): number[] {
  if (columnRight <= 0) return DEFAULT_ANCHORS;
  const last = Math.floor((columnRight - 20 - WIRE_LOW_X) / SWAG_WIDTH);
  const first = Math.max(0, last - 2);
  return [first, first + 1, first + 2].map((k) => WIRE_LOW_X + k * SWAG_WIDTH);
}

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
      {/* Boule, frise et reflet. */}
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
  const ref = useRef<HTMLDivElement>(null);
  const [anchors, setAnchors] = useState<number[]>(DEFAULT_ANCHORS);

  // useLayoutEffect : on mesure la page AVANT que le navigateur l'affiche (pas de saut visible
  // des boules), puis à chaque changement de largeur (rotation du téléphone, fenêtre).
  useLayoutEffect(() => {
    const decor = ref.current;
    // La colonne de contenu est la bande sœur du décor (le conteneur du titre).
    const column = decor?.nextElementSibling;
    if (!decor || !column) return;
    function measure() {
      const decorBox = decor!.getBoundingClientRect();
      const columnBox = column!.getBoundingClientRect();
      const paddingRight = parseFloat(getComputedStyle(column!).paddingRight) || 0;
      setAnchors(anchorsFor(columnBox.right - paddingRight - decorBox.left));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-testid="christmas-baubles"
      // Du fil de la guirlande (au-dessus de la page) jusqu'au haut du titre : la marge haute
      // de l'en-tête de page. Les fils s'allongent sur desktop, où la marge est plus grande.
      className="pointer-events-none absolute inset-x-0 h-[calc(var(--spacing-section)+23.5px)] overflow-hidden md:h-[calc(var(--spacing-section-lg)+23.5px)] md:[--bauble-extra:1.5rem]"
      style={{ top: -WIRE_ABOVE_PAGE }}
    >
      {STARS.map((star, index) => (
        <span
          key={index}
          className="christmas-star absolute"
          style={
            {
              left: anchors[0]! + star.dx,
              top: star.top,
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
          className="bauble-swing absolute top-0 flex flex-col items-center"
          style={
            {
              left: anchors[index]! - bauble.size / 2,
              width: bauble.size,
              "--swing-amp": `${bauble.amp}deg`,
              "--swing-duration": `${bauble.duration}s`,
              "--swing-delay": `${bauble.delay}s`,
            } as CSSProperties
          }
        >
          {/* Crochet posé sur le fil de la guirlande, puis le fil de la boule. */}
          <span className="block size-[5px] -translate-y-[2px] rounded-full border border-[#8f8f8f]" />
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
