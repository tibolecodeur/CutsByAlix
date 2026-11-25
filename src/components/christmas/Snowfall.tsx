import type { CSSProperties } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** Nombre de flocons : tous à partir de md, les MOBILE_COUNT premiers sur téléphone. */
const FLAKE_COUNT = 56;
const MOBILE_COUNT = 30;

type Flake = {
  left: number; // % de la largeur
  size: number; // px
  duration: number; // s, durée de la chute
  delay: number; // s, négatif : le flocon est déjà en route au chargement
  sway: number; // px, amplitude du balancement
  crystal: boolean; // cristal à six branches, sinon neige fine (point)
  opacity: number;
};

/**
 * Suite pseudo-aléatoire FIXE (même rendu à chaque visite, tests stables) : un générateur
 * congruentiel simple, graine constante. Ce n'est pas de la cryptographie, juste une
 * répartition qui a l'air naturelle.
 */
function makeFlakes(): Flake[] {
  let seed = 7;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: FLAKE_COUNT }, (_, index) => {
    const crystal = index % 3 === 0;
    return {
      left: Math.round(next() * 1000) / 10,
      // Cristaux de 18 px au plus : ils passent devant le texte (revue design).
      size: crystal ? 12 + Math.round(next() * 6) : 3 + Math.round(next() * 4),
      duration: 9 + Math.round(next() * 9),
      delay: -Math.round(next() * 18),
      sway: 12 + Math.round(next() * 26),
      crystal,
      opacity: 0.65 + Math.round(next() * 25) / 100,
    };
  });
}

const FLAKES = makeFlakes();

/**
 * Cristal à six branches. Double trait : un trait gris clair plus épais dessous, le blanc
 * dessus, pour qu'un flocon blanc reste lisible sur les fonds blancs du site.
 */
function Crystal() {
  const arms = [0, 60, 120];
  const lines = arms.map((angle) => (
    <g key={angle} transform={`rotate(${angle} 12 12)`}>
      <path d="M12 1v22M12 5l-3-3M12 5l3-3M12 19l-3 3M12 19l3 3" />
    </g>
  ));
  return (
    <svg viewBox="0 0 24 24" className="block size-full" fill="none" strokeLinecap="round">
      <g stroke="rgb(17 17 17 / 0.16)" strokeWidth="3.2">
        {lines}
      </g>
      <g stroke="#ffffff" strokeWidth="1.6">
        {lines}
      </g>
    </svg>
  );
}

/**
 * Neige qui tombe sur les pages publiques (Noël). Calque fixe, décoratif : invisible pour les
 * lecteurs d'écran, il ne capte ni les clics ni le doigt. UNE seule animation `transform` par
 * flocon (index.css, `snow-fall`) : chute, balancement et rotation des cristaux ensemble.
 * Au-dessus de l'en-tête (z-45) : sinon son verre dépoli serait recalculé à chaque image tant
 * qu'un flocon passe derrière. Rien du tout si l'utilisateur a demandé moins d'animations.
 */
export function Snowfall() {
  const reducedMotion = usePrefersReducedMotion();
  if (reducedMotion) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="snowfall"
      // h-lvh : la plus grande hauteur d'écran (barre d'adresse rentrée) ; la chute n'est
      // pas recalculée quand la barre d'adresse du téléphone apparaît ou disparaît.
      className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-lvh overflow-hidden [contain:strict]"
    >
      {FLAKES.map((flake, index) => (
        <span
          key={index}
          className={index < MOBILE_COUNT ? "snowflake" : "snowflake hidden md:block"}
          // Variables CSS lues par index.css. React les pose par le DOM (element.style), ce
          // que la CSP autorise, contrairement à un attribut style écrit dans le HTML.
          style={
            {
              left: `${flake.left}%`,
              width: flake.size,
              height: flake.size,
              opacity: flake.opacity,
              "--snow-duration": `${flake.duration}s`,
              "--snow-delay": `${flake.delay}s`,
              "--snow-sway": `${flake.sway}px`,
              "--snow-spin": flake.crystal ? "360deg" : "0deg",
            } as CSSProperties
          }
        >
          {flake.crystal ? <Crystal /> : <span className="snowflake-dot" />}
        </span>
      ))}
    </div>
  );
}
