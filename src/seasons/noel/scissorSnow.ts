/**
 * Physique de la neige de ciseaux (ScissorSnow.tsx), sans dessin ni navigateur : testable.
 *
 * Adaptée du composant PixelSnow de React Bits (https://reactbits.dev, licence MIT + Commons
 * Clause) : mêmes 5 niveaux de profondeur (les lointains tombent plus lentement et plus pâles),
 * même vent, même balancement, même apparition par le haut et même écart au passage du
 * pointeur. Ce qui change : des ciseaux vectoriels mêlés de flocons, qui tournent sur
 * eux-mêmes, au lieu de cristaux en pixels, et moins d'éléments (un téléphone en 4G doit
 * rester fluide).
 */

export const LEVELS = 5;
/** Part de chaque niveau, du plus lointain (petit) au plus proche (grand). */
const LEVEL_WEIGHTS = [0.46, 0.27, 0.15, 0.08, 0.04];
/** Vitesse de chute de chaque niveau, en px/s. */
const LEVEL_FALL = [16, 24, 34, 48, 66];
/** Luminosité de chaque niveau (avant l'effet de profondeur). */
export const LEVEL_LIGHT = [0.42, 0.58, 0.76, 0.92, 1];
/** Taille des ciseaux de chaque niveau, en px (avant `size`). */
export const LEVEL_SIZE = [9, 11, 14, 17, 21];
/** Surface d'écran par élément à densité 1 (en px²) : ~170 éléments sur un écran de 1280×800. */
const AREA_PER_FLAKE = 6000;
export const MAX_FLAKES = 220;
export const INTRO_SECONDS = 1.4;

export type SnowSettings = {
  density: number;
  speed: number;
  wind: number;
  sway: number;
  /** 0 : surtout de petits ciseaux ; 2 : surtout de grands. */
  flakeSize: number;
  depth: number;
  /** Tours par seconde, au plus. */
  spin: number;
  /** Part de flocons parmi les ciseaux, de 0 (que des ciseaux) à 1 (que des flocons). */
  flakeShare: number;
};

/** Ce qui tombe : une paire de ciseaux ou un flocon de neige. */
export type FlakeKind = "scissors" | "flake";

export type Flake = {
  kind: FlakeKind;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  rate: number;
  drift: number;
  angle: number;
  turn: number;
  sparkle: number;
  /** Ordre d'apparition pendant l'intro (0–1) ; négatif : déjà apparu. */
  reveal: number;
};

export type View = { width: number; height: number };
export type Pointer = { x: number; y: number; vx: number; vy: number; inside: boolean };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Générateur pseudo-aléatoire à graine (mulberry32) : même neige à chaque visite. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickLevel(r: number, flakeSize: number): number {
  const shift = clamp(flakeSize, 0, 2) - 1;
  const weights = LEVEL_WEIGHTS.map(
    (weight, level) => weight * Math.pow(2.2, shift * (level - 1.5)),
  );
  const sum = weights.reduce((a, b) => a + b, 0);
  let total = 0;
  for (let level = 0; level < LEVELS; level++) {
    total += weights[level]! / sum;
    if (r <= total) return level;
  }
  return LEVELS - 1;
}

export function spawn(rng: () => number, view: View, s: SnowSettings, top: boolean): Flake {
  const level = pickLevel(rng(), s.flakeSize);
  const kind: FlakeKind = rng() < clamp(s.flakeShare, 0, 1) ? "flake" : "scissors";
  return {
    kind,
    level,
    x: rng() * (view.width + 40) - 20,
    y: top ? -10 - rng() * 30 : rng() * view.height,
    vx: 0,
    vy: LEVEL_FALL[level]!,
    phase: rng() * Math.PI * 2,
    rate: 0.6 + rng() * 0.9,
    drift: 0.7 + rng() * 0.6,
    angle: rng() * Math.PI * 2,
    // Sens et vitesse de rotation propres à chaque paire de ciseaux.
    turn: (rng() < 0.5 ? -1 : 1) * (0.25 + rng() * 0.75),
    sparkle: rng() * 100,
    reveal: top ? -1 : rng(),
  };
}

/** Nombre de ciseaux pour cette surface et cette densité. */
export function targetCount(view: View, density: number): number {
  return Math.round(
    clamp((view.width * view.height * clamp(density, 0, 1)) / AREA_PER_FLAKE, 0, MAX_FLAKES),
  );
}

/** Ajoute ou retire des ciseaux pour atteindre le nombre voulu. */
export function populate(flakes: Flake[], rng: () => number, view: View, s: SnowSettings) {
  const target = targetCount(view, s.density);
  while (flakes.length < target) flakes.push(spawn(rng, view, s, false));
  if (flakes.length > target) flakes.length = target;
}

/**
 * Avance la neige de `dt` secondes : chute, vent, balancement, rotation, écart au pointeur
 * (`push` de 0 à 1), et recyclage par le haut des ciseaux sortis par le bas.
 */
export function simulate(
  flakes: Flake[],
  rng: () => number,
  view: View,
  s: SnowSettings,
  time: number,
  dt: number,
  pointer: Pointer,
  push: number,
) {
  const windSpeed = clamp(s.wind, -2, 2) * 46;
  const radius = 120;
  const pushing = push > 0.001 && pointer.inside;
  const margin = 24;
  const ease = 1 - Math.exp(-dt * 2.2);
  for (let i = 0; i < flakes.length; i++) {
    const flake = flakes[i]!;
    const level = flake.level;
    const parallax = 1 - s.depth * (1 - (level + 1) / LEVELS) * 0.75;
    const swing = Math.sin(time * flake.rate + flake.phase) * s.sway * (6 + level * 7);
    const targetX = (windSpeed * parallax + swing) * flake.drift;
    const targetY = LEVEL_FALL[level]! * parallax * s.speed * flake.drift;
    flake.vx += (targetX - flake.vx) * ease;
    flake.vy += (targetY - flake.vy) * ease;
    if (pushing) {
      const dx = flake.x - pointer.x;
      const dy = flake.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < radius && distance > 0.001) {
        const near = 1 - distance / radius;
        const repel = near * near * near * push * 1500 * dt;
        const carry = near * near * push * dt * 5;
        flake.vx += (dx / distance) * repel + pointer.vx * carry;
        flake.vy += (dy / distance) * repel + pointer.vy * carry;
      }
    }
    flake.x += flake.vx * dt;
    flake.y += flake.vy * dt;
    flake.angle += flake.turn * s.spin * Math.PI * 2 * dt;
    const out = s.speed >= 0 ? flake.y > view.height + margin : flake.y < -margin;
    if (out) {
      const fresh = spawn(rng, view, s, true);
      if (s.speed < 0) fresh.y = view.height + 10 + rng() * 30;
      flakes[i] = fresh;
      continue;
    }
    if (flake.x < -margin) flake.x += view.width + margin * 2;
    else if (flake.x > view.width + margin) flake.x -= view.width + margin * 2;
  }
}

/**
 * Opacité d'un ciseau : profondeur (lointain = pâle), scintillement occasionnel et apparition
 * par le haut pendant l'intro (`intro` de 0 à 1).
 */
export function flakeAlpha(
  flake: Flake,
  view: View,
  depth: number,
  twinkle: number,
  time: number,
  intro: number,
): number {
  const light = 1 - depth * (1 - LEVEL_LIGHT[flake.level]!);
  const spark = Math.pow(Math.max(0, Math.sin(time * 0.9 + flake.sparkle)), 60) * twinkle;
  const sweep = intro * 1.75;
  const reveal =
    flake.reveal < 0 || intro >= 1
      ? 1
      : clamp((sweep - flake.y / view.height - flake.reveal * 0.25) / 0.35, 0, 1);
  return Math.min(1, light * (0.85 + spark * 0.6)) * reveal * reveal;
}
