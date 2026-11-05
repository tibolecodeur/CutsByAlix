import { useEffect, useLayoutEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import {
  flakeAlpha,
  INTRO_SECONDS,
  LEVEL_SIZE,
  LEVELS,
  populate,
  seeded,
  simulate,
  type Flake,
  type Pointer,
  type SnowSettings,
  type View,
} from "@/seasons/noel/scissorSnow";

/**
 * Neige de petits ciseaux sur la vidéo du hero (version de Noël, ADR 0013).
 *
 * Adapté du composant PixelSnow de React Bits (https://reactbits.dev, licence MIT + Commons
 * Clause), à la demande de Thibault : mêmes réglages et même physique (scissorSnow.ts), mais
 * des ciseaux normaux, vectoriels, qui tournent en tombant, au lieu de cristaux en pixels.
 * Dessin en Canvas 2D (pas de WebGL) : une image de ciseaux par niveau de profondeur est
 * préparée une fois, puis seulement déplacée et tournée à chaque image.
 *
 * - Aucune animation si l'utilisateur réduit les animations : une image fixe, discrète.
 * - Rien ne tourne quand le hero n'est plus à l'écran ou que l'onglet est caché (batterie).
 * - Décor pur : canvas `aria-hidden`, ne capte aucun toucher.
 */

/** Ciseaux de Lucide (licence ISC), dessin 24 × 24 : deux anneaux, deux lames. */
const SCISSORS_PATH =
  "M9 6a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0Z M20 4 8.12 15.88 M14.47 14.48 20 20 M8.12 8.12 12 12";

type ScissorSnowProps = Partial<SnowSettings> & {
  color?: string;
  /** Halo lumineux autour de chaque paire de ciseaux, de 0 à 1. */
  glow?: number;
  /** Scintillement occasionnel, de 0 à 1. */
  twinkle?: number;
  opacity?: number;
  /** Les ciseaux s'écartent au passage du pointeur. */
  mouseInteraction?: boolean;
  /** Arrivée par le haut au premier affichage. */
  intro?: boolean;
  paused?: boolean;
  /** Densité de pixels maximale (2 par défaut). */
  dpr?: number;
  className?: string;
};

/** Image d'une paire de ciseaux de `size` px, avec halo, prête à être posée (une par niveau). */
function makeSprite(size: number, ratio: number, color: string, glow: number) {
  const pad = Math.ceil(size * 0.5);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((size + pad * 2) * ratio);
  canvas.height = canvas.width;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(ratio, ratio);
  context.translate(pad, pad);
  context.scale(size / 24, size / 24);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.lineJoin = "round";
  // Halo cuit une fois pour toutes dans l'image (jamais recalculé pendant l'animation).
  context.shadowColor = color;
  context.shadowBlur = glow * 6 * (24 / size) * ratio;
  context.stroke(new Path2D(SCISSORS_PATH));
  return { canvas, half: (size + pad * 2) / 2 };
}

export default function ScissorSnow({
  color = "#ffffff",
  density = 0.5,
  speed = 1,
  wind = 0.25,
  sway = 0.5,
  flakeSize = 1,
  depth = 0.6,
  spin = 0.25,
  glow = 0.6,
  twinkle = 0.35,
  opacity = 1,
  mouseInteraction = true,
  intro = true,
  paused = false,
  dpr,
  className,
}: ScissorSnowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Réglages lus à chaque image sans relancer l'animation (comme un champ lu par une boucle
  // Java). Mis à jour juste après chaque rendu : React interdit d'écrire une ref PENDANT.
  const settings = { color, density, speed, wind, sway, flakeSize, depth, spin };
  const options = { glow, twinkle, opacity, mouseInteraction, intro, paused, dpr };
  const settingsRef = useRef(settings);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    settingsRef.current = settings;
    optionsRef.current = options;
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!container || !canvas || !context) return undefined;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const rng = seeded(4271);
    const flakes: Flake[] = [];
    const view: View = { width: 1, height: 1 };
    const pointer: Pointer = { x: 0, y: 0, vx: 0, vy: 0, inside: false };
    let pointerTime = 0;
    let ratio = 1;
    let sprites: ({ canvas: HTMLCanvasElement; half: number } | null)[] = [];
    let spriteKey = "";
    const state = { time: 0, intro: optionsRef.current.intro && !reduce ? 0 : 1, push: 0 };
    let raf = 0;
    let last = 0;
    let visible = true;

    const ensureSprites = () => {
      const s = settingsRef.current;
      const o = optionsRef.current;
      const scale = 0.75 + Math.max(0, Math.min(2, s.flakeSize)) * 0.25;
      const key = `${s.color}|${o.glow}|${ratio}|${scale}`;
      if (key === spriteKey) return;
      spriteKey = key;
      sprites = Array.from({ length: LEVELS }, (_, level) =>
        makeSprite(LEVEL_SIZE[level]! * scale, ratio, s.color, o.glow),
      );
    };

    const render = () => {
      const s = settingsRef.current;
      const o = optionsRef.current;
      ensureSprites();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const flake of flakes) {
        const sprite = sprites[flake.level];
        if (!sprite) continue;
        const alpha = flakeAlpha(flake, view, s.depth, o.twinkle, state.time, state.intro);
        if (alpha <= 0.01) continue;
        context.globalAlpha = alpha * Math.max(0, Math.min(1, o.opacity));
        const cos = Math.cos(flake.angle) * ratio;
        const sin = Math.sin(flake.angle) * ratio;
        context.setTransform(cos, sin, -sin, cos, flake.x * ratio, flake.y * ratio);
        context.drawImage(
          sprite.canvas,
          -sprite.half,
          -sprite.half,
          sprite.half * 2,
          sprite.half * 2,
        );
      }
      context.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const o = optionsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const moving = !o.paused && !reduce;
      if (!o.intro || reduce) state.intro = 1;
      else if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / INTRO_SECONDS);
      const goal = o.mouseInteraction && pointer.inside && !reduce ? 1 : 0;
      state.push += (goal - state.push) * (1 - Math.exp(-dt * (goal ? 6 : 3)));
      pointer.vx *= Math.exp(-dt * 6);
      pointer.vy *= Math.exp(-dt * 6);
      populate(flakes, rng, view, s);
      if (moving) {
        state.time += dt;
        simulate(flakes, rng, view, s, state.time, dt, pointer, state.push);
      }
      render();
      if (moving) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      ratio = Math.min(optionsRef.current.dpr || window.devicePixelRatio || 1, 2);
      view.width = width;
      view.height = height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      populate(flakes, rng, view, settingsRef.current);
      if (!raf) render();
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const now = performance.now();
      if (pointer.inside && pointerTime) {
        const elapsed = Math.max(1, now - pointerTime) / 1000;
        pointer.vx = Math.max(-3000, Math.min(3000, (x - pointer.x) / elapsed));
        pointer.vy = Math.max(-3000, Math.min(3000, (y - pointer.y) / elapsed));
      }
      pointer.x = x;
      pointer.y = y;
      pointerTime = now;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      wake();
    };
    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };
    const onVisibility = () => {
      last = 0;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cx("pointer-events-none overflow-hidden", className)}
      data-testid="noel-scissor-snow"
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}
