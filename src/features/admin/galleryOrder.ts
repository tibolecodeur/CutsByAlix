/**
 * Ordre de la galerie côté écran. La base ne sait qu'échanger une photo avec sa voisine
 * (`admin_move_gallery_item`, renumérotation sans trou) : « mettre en premier / en dernier »
 * enchaîne ces échanges, sans nouvelle fonction SQL ni nouveau droit.
 */

type Direction = "up" | "down";

/**
 * Déplace la photo de `steps` places dans `direction`, un échange à la fois. S'arrête dès que
 * la base répond `false` (déjà au bout : la liste a pu changer dans un autre onglet). Renvoie le
 * nombre de places réellement parcourues, pour remettre l'écran d'accord avec la base.
 */
export async function moveToEdge(
  id: string,
  steps: number,
  direction: Direction,
  move: (id: string, direction: Direction) => Promise<boolean>,
): Promise<number> {
  let moved = 0;
  while (moved < steps) {
    if (!(await move(id, direction))) break;
    moved++;
  }
  return moved;
}

/** Copie de `list` où l'élément en position `from` est déplacé en position `to`. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [element] = next.splice(from, 1);
  next.splice(to, 0, element as T);
  return next;
}
