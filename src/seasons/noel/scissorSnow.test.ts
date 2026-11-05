import { describe, expect, it } from "vitest";
import {
  flakeAlpha,
  MAX_FLAKES,
  pickLevel,
  populate,
  seeded,
  simulate,
  spawn,
  targetCount,
  type Flake,
  type SnowSettings,
} from "@/seasons/noel/scissorSnow";

const SETTINGS: SnowSettings = {
  density: 0.5,
  speed: 1,
  wind: 0,
  sway: 0,
  flakeSize: 1,
  depth: 0.6,
  spin: 0.25,
};
const VIEW = { width: 375, height: 800 };
const NO_POINTER = { x: 0, y: 0, vx: 0, vy: 0, inside: false };

function flake(overrides: Partial<Flake> = {}): Flake {
  return {
    level: 2,
    x: 100,
    y: 100,
    vx: 0,
    vy: 34,
    phase: 0,
    rate: 1,
    drift: 1,
    angle: 0,
    turn: 1,
    sparkle: 0,
    reveal: -1,
    ...overrides,
  };
}

/** Fait tourner la simulation `seconds` secondes, par pas de 1/60 s. */
function run(
  flakes: Flake[],
  settings: SnowSettings,
  seconds: number,
  pointer = NO_POINTER,
  push = 0,
) {
  const rng = seeded(1);
  for (let t = 0; t < seconds; t += 1 / 60) {
    simulate(flakes, rng, VIEW, settings, t, 1 / 60, pointer, push);
  }
}

describe("seeded", () => {
  it("même graine, même suite : la neige est la même à chaque visite", () => {
    const a = seeded(42);
    const b = seeded(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
  });
});

describe("pickLevel", () => {
  it("niveaux de 0 (lointain) à 4 (proche) ; flakeSize décale vers les grands ciseaux", () => {
    const share = (size: number) => {
      const rng = seeded(7);
      let big = 0;
      for (let i = 0; i < 2000; i++) if (pickLevel(rng(), size) >= 3) big++;
      return big / 2000;
    };
    expect(pickLevel(0, 1)).toBe(0);
    expect(pickLevel(0.9999, 1)).toBe(4);
    expect(share(2)).toBeGreaterThan(share(1));
    expect(share(0)).toBeLessThan(share(1));
  });
});

describe("targetCount / populate", () => {
  it("nombre proportionnel à la surface et à la densité, plafonné", () => {
    expect(targetCount(VIEW, 0)).toBe(0);
    expect(targetCount(VIEW, 0.5)).toBeGreaterThan(10);
    expect(targetCount({ width: 1280, height: 800 }, 1)).toBeGreaterThan(targetCount(VIEW, 1));
    expect(targetCount({ width: 4000, height: 4000 }, 1)).toBe(MAX_FLAKES);
  });

  it("ajoute puis retire des ciseaux pour suivre la densité", () => {
    const flakes: Flake[] = [];
    const rng = seeded(3);
    populate(flakes, rng, VIEW, SETTINGS);
    expect(flakes).toHaveLength(targetCount(VIEW, 0.5));
    populate(flakes, rng, VIEW, { ...SETTINGS, density: 0.1 });
    expect(flakes).toHaveLength(targetCount(VIEW, 0.1));
  });
});

describe("spawn", () => {
  it("par le haut (hors écran) quand il recycle, n'importe où au premier affichage", () => {
    const rng = seeded(5);
    const top = spawn(rng, VIEW, SETTINGS, true);
    expect(top.y).toBeLessThan(0);
    expect(top.reveal).toBe(-1);
    const anywhere = spawn(rng, VIEW, SETTINGS, false);
    expect(anywhere.y).toBeGreaterThanOrEqual(0);
    expect(anywhere.y).toBeLessThanOrEqual(VIEW.height);
  });
});

describe("simulate", () => {
  it("les ciseaux tombent et tournent sur eux-mêmes", () => {
    const flakes = [flake()];
    run(flakes, SETTINGS, 1);
    expect(flakes[0]!.y).toBeGreaterThan(120);
    expect(flakes[0]!.angle).toBeGreaterThan(1);
  });

  it("le vent les pousse sur le côté", () => {
    const flakes = [flake()];
    run(flakes, { ...SETTINGS, wind: 1 }, 1);
    expect(flakes[0]!.x).toBeGreaterThan(110);
  });

  it("vitesse négative : ils remontent", () => {
    const flakes = [flake({ vy: 0 })];
    run(flakes, { ...SETTINGS, speed: -1 }, 1);
    expect(flakes[0]!.y).toBeLessThan(100);
  });

  it("sortis par le bas : recyclés en haut de l'écran", () => {
    const flakes = [flake({ y: VIEW.height + 30 })];
    run(flakes, SETTINGS, 1 / 60);
    expect(flakes[0]!.y).toBeLessThan(0);
  });

  it("sortis par un côté : reviennent de l'autre", () => {
    const flakes = [flake({ x: -30 })];
    run(flakes, SETTINGS, 1 / 60);
    expect(flakes[0]!.x).toBeGreaterThan(VIEW.width);
  });

  it("le pointeur les écarte de son chemin", () => {
    const near = [flake({ x: 110, y: 100 })];
    run(near, SETTINGS, 0.3, { x: 100, y: 100, vx: 0, vy: 0, inside: true }, 1);
    const free = [flake({ x: 110, y: 100 })];
    run(free, SETTINGS, 0.3);
    expect(near[0]!.x).toBeGreaterThan(free[0]!.x + 5);
  });
});

describe("flakeAlpha", () => {
  it("les lointains sont plus pâles que les proches", () => {
    const far = flakeAlpha(flake({ level: 0, sparkle: 99 }), VIEW, 0.6, 0, 0, 1);
    const close = flakeAlpha(flake({ level: 4, sparkle: 99 }), VIEW, 0.6, 0, 0, 1);
    expect(far).toBeLessThan(close);
  });

  it("pendant l'intro, ceux du bas n'apparaissent qu'après ceux du haut", () => {
    const high = flakeAlpha(flake({ y: 50, reveal: 0 }), VIEW, 0.6, 0, 0, 0.3);
    const low = flakeAlpha(flake({ y: 750, reveal: 0 }), VIEW, 0.6, 0, 0, 0.3);
    expect(high).toBeGreaterThan(0);
    expect(low).toBe(0);
    expect(flakeAlpha(flake({ y: 750, reveal: 0 }), VIEW, 0.6, 0, 0, 1)).toBeGreaterThan(0);
  });
});
