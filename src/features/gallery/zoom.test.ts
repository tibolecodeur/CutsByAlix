import { describe, expect, it } from "vitest";
import { easeOutCubic, slideIndex, zoomKeyframes, type Rect } from "@/features/gallery/zoom";

/** Lit `translate(Xpx, Ypx) scale(SX, SY)` (cadre) ou `scale(SX, SY)` (photo). */
function parse(transform: string) {
  const numbers = (transform.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  if (transform.startsWith("translate")) {
    const [tx, ty, sx, sy] = numbers;
    return { tx: tx!, ty: ty!, sx: sx!, sy: sy! };
  }
  const [sx, sy] = numbers;
  return { tx: 0, ty: 0, sx: sx!, sy: sy! };
}

// Vignette du carrousel recadrée en 4:5, grande photo dans ses proportions.
const THUMB: Rect = { left: 16, top: 900, width: 300, height: 375 };
const LANDSCAPE: Rect = { left: 0, top: 200, width: 375, height: 281.25 }; // 4:3
const PORTRAIT: Rect = { left: 20, top: 60, width: 335, height: 502.5 }; // 2:3
const SQUARE: Rect = { left: 10, top: 150, width: 355, height: 355 };

describe("zoomKeyframes", () => {
  it.each([
    ["paysage", LANDSCAPE],
    ["portrait", PORTRAIT],
    ["carrée", SQUARE],
  ])("photo %s : part de la vignette et arrive à sa place, sans transformation", (_, target) => {
    const { frame, image } = zoomKeyframes(THUMB, target, "open");

    const first = parse(String(frame[0]!.transform));
    expect(first.tx).toBeCloseTo(THUMB.left - target.left, 2);
    expect(first.ty).toBeCloseTo(THUMB.top - target.top, 2);
    expect(target.width * first.sx).toBeCloseTo(THUMB.width, 1);
    expect(target.height * first.sy).toBeCloseTo(THUMB.height, 1);

    expect(frame.at(-1)!.transform).toBe("translate(0px, 0px) scale(1, 1)");
    expect(image.at(-1)!.transform).toBe("scale(1, 1)");
  });

  it("à chaque image, la photo garde ses proportions et couvre tout le cadre (comme object-cover)", () => {
    for (const target of [LANDSCAPE, PORTRAIT, SQUARE]) {
      const { frame, image } = zoomKeyframes(THUMB, target, "open");
      frame.forEach((keyframe, step) => {
        const box = parse(String(keyframe.transform));
        const photo = parse(String(image[step]!.transform));
        // Échelle réelle de la photo = échelle du cadre × contre-échelle de la photo.
        const scaleX = box.sx * photo.sx;
        const scaleY = box.sy * photo.sy;
        expect(scaleX).toBeCloseTo(scaleY, 3);
        expect(scaleX).toBeGreaterThanOrEqual(box.sx - 1e-3);
        expect(scaleY).toBeGreaterThanOrEqual(box.sy - 1e-3);
      });
    }
  });

  it("fermeture : le chemin inverse, de la grande photo vers la vignette", () => {
    const open = zoomKeyframes(THUMB, PORTRAIT, "open");
    const close = zoomKeyframes(THUMB, PORTRAIT, "close");
    expect(close.frame[0]).toEqual(open.frame.at(-1));
    expect(close.frame.at(-1)).toEqual(open.frame[0]);
    expect(close.image.at(-1)).toEqual(open.image[0]);
    expect(close.frame).toHaveLength(open.frame.length);
  });

  it("décélère : la photo fait la plus grande partie du trajet au début", () => {
    const { frame } = zoomKeyframes(THUMB, LANDSCAPE, "open");
    const middle = parse(String(frame[Math.floor(frame.length / 2)]!.transform));
    const remaining = Math.abs(middle.ty) / Math.abs(THUMB.top - LANDSCAPE.top);
    expect(remaining).toBeLessThan(0.2);
  });

  it("cadre vide (photo pas encore mesurée) : aucune division par zéro", () => {
    const { frame, image } = zoomKeyframes(THUMB, { left: 0, top: 0, width: 0, height: 0 }, "open");
    for (const keyframe of [...frame, ...image]) {
      expect(String(keyframe.transform)).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe("easeOutCubic", () => {
  it("part de 0, arrive à 1, et ralentit", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });
});

describe("slideIndex", () => {
  it("donne la photo calée à l'écran, bornée aux photos existantes", () => {
    expect(slideIndex(0, 375, 4)).toBe(0);
    expect(slideIndex(750, 375, 4)).toBe(2);
    expect(slideIndex(560, 375, 4)).toBe(1); // à mi-chemin : la plus proche
    expect(slideIndex(5000, 375, 4)).toBe(3);
    expect(slideIndex(-20, 375, 4)).toBe(0);
    expect(slideIndex(300, 0, 4)).toBe(0);
  });
});
