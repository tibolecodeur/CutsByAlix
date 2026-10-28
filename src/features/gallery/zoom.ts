/**
 * Calcul de l'effet « on rentre dans la photo » de la vue agrandie (technique FLIP : First,
 * Last, Invert, Play). La grande photo est affichée à sa place finale, puis une animation de
 * `transform` la fait partir de la vignette du carrousel. Seul `transform` bouge (docs/DESIGN.md :
 * transform et opacity uniquement), ce que le téléphone anime sans recalculer la page.
 *
 * Difficulté : la vignette est recadrée en 4:5 (`object-cover`) alors que la grande photo garde
 * ses proportions. Le cadre (qui rogne, `overflow: hidden`) est donc étiré de façon non
 * uniforme pour épouser la vignette, et la photo à l'intérieur reçoit une contre-échelle qui
 * annule l'étirement : elle reste toujours dans ses proportions et couvre le cadre.
 * Les deux échelles ne s'interpolent pas proprement entre deux images-clés : on calcule donc
 * chaque étape du trajet (`STEPS` images-clés, courbe de vitesse déjà appliquée) plutôt que de
 * laisser le navigateur interpoler entre le début et la fin.
 */

export type Rect = { left: number; top: number; width: number; height: number };

export type ZoomKeyframes = {
  /** Cadre de la grande photo (`transform-origin: 0 0`). */
  frame: Keyframe[];
  /** Photo dans le cadre (`transform-origin: center`). */
  image: Keyframe[];
};

/** Nombre d'étapes : au-delà, aucune différence visible ; en deçà, la photo « vibre ». */
const STEPS = 24;

/** Départ rapide, arrivée douce : la photo « vient à soi » puis se pose. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function lerp(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

/** Arrondi à 4 décimales : des chaînes courtes, et pas de « -0.0000001px ». */
function round(value: number) {
  return Math.round(value * 10_000) / 10_000 || 0;
}

/** Évite la division par zéro si le cadre n'est pas encore mesuré (largeur nulle). */
function ratio(part: number, whole: number) {
  return whole > 0 ? part / whole : 1;
}

/**
 * Images-clés du zoom entre la vignette `thumb` et la place finale `target` de la grande
 * photo (rectangles mesurés à l'écran par `getBoundingClientRect`). « open » va de la vignette
 * à la grande photo, « close » fait le chemin inverse, avec la même décélération à l'arrivée.
 */
export function zoomKeyframes(
  thumb: Rect,
  target: Rect,
  direction: "open" | "close",
): ZoomKeyframes {
  const frame: Keyframe[] = [];
  const image: Keyframe[] = [];
  for (let step = 0; step <= STEPS; step++) {
    const eased = easeOutCubic(step / STEPS);
    // Part du chemin parcouru depuis la vignette (0 = vignette, 1 = grande photo).
    const progress = direction === "open" ? eased : 1 - eased;
    const width = lerp(thumb.width, target.width, progress);
    const height = lerp(thumb.height, target.height, progress);
    const scaleX = ratio(width, target.width);
    const scaleY = ratio(height, target.height);
    // La photo couvre le cadre : la plus grande des deux échelles, comme object-cover.
    const cover = Math.max(scaleX, scaleY);
    const translateX = lerp(thumb.left, target.left, progress) - target.left;
    const translateY = lerp(thumb.top, target.top, progress) - target.top;
    frame.push({
      transform: `translate(${round(translateX)}px, ${round(translateY)}px) scale(${round(scaleX)}, ${round(scaleY)})`,
    });
    image.push({
      transform: `scale(${round(ratio(cover, scaleX))}, ${round(ratio(cover, scaleY))})`,
    });
  }
  return { frame, image };
}

/** Photo calée à l'écran dans la bande de la vue agrandie (une photo par largeur d'écran). */
export function slideIndex(scrollLeft: number, slideWidth: number, count: number): number {
  if (slideWidth <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / slideWidth)));
}
