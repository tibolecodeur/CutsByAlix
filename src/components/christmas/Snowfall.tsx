import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * Flocons fixes et non aléatoires : même rendu à chaque visite, tests stables.
 * left (% de la largeur), size (px), duration et delay (s), drift (dérive latérale, px).
 * Les 12 premiers s'affichent partout, les suivants seulement à partir de md (moins de
 * calques sur un téléphone).
 */
const FLAKES = [
  [4, 6, 11, -2, 18],
  [12, 4, 14, -9, -12],
  [19, 7, 12, -5, 24],
  [27, 5, 16, -12, -20],
  [35, 6, 13, -1, 14],
  [43, 4, 15, -7, -16],
  [51, 8, 12, -10, 20],
  [59, 5, 14, -3, -24],
  [67, 6, 11, -8, 16],
  [75, 4, 16, -13, -14],
  [83, 7, 13, -4, 22],
  [91, 5, 15, -11, -18],
  [8, 5, 17, -6, 12],
  [23, 6, 12, -14, -22],
  [39, 4, 14, -2, 18],
  [47, 7, 16, -9, -12],
  [63, 5, 13, -15, 20],
  [71, 6, 15, -5, -16],
  [87, 4, 12, -12, 14],
  [96, 6, 14, -7, -20],
] as const;
const MOBILE_COUNT = 12;

/**
 * Neige qui tombe sur les pages publiques (Noël). Calque fixe, décoratif : invisible pour les
 * lecteurs d'écran, il ne capte ni les clics ni le doigt. Seul `transform` est animé
 * (index.css, `snow-fall`). Rien du tout si l'utilisateur a demandé moins d'animations.
 */
export function Snowfall() {
  const reducedMotion = usePrefersReducedMotion();
  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="snowfall"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
    >
      {FLAKES.map(([left, size, duration, delay, drift], index) => (
        <span
          key={index}
          className={index < MOBILE_COUNT ? "snowflake" : "snowflake hidden md:block"}
          // Variables CSS lues par l'utilitaire `snowflake` (index.css). React les pose par le
          // DOM (element.style), ce que la CSP autorise, contrairement à un attribut style HTML.
          style={
            {
              left: `${left}%`,
              width: size,
              height: size,
              "--snow-duration": `${duration}s`,
              "--snow-delay": `${delay}s`,
              "--snow-drift": `${drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
