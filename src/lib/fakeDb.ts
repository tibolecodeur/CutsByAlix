import { randomUuid } from "@/lib/uuid";

/**
 * Fausse base de données EN MÉMOIRE, pour construire les écrans sans Supabase.
 * TODO: brancher Supabase. Ce fichier disparaîtra : seuls les `data.ts` de chaque
 * fonctionnalité le lisent, jamais les écrans.
 *
 * Il ne reste que la galerie (prestations, lieux, disponibilités et rendez-vous lisent la vraie
 * base). Les lignes ont la forme exacte de la table `gallery_items` (snake_case, dates ISO),
 * comme les renverra Supabase. Les données sont recréées à chaque chargement de la page.
 */

export type GalleryItemRow = {
  id: string;
  image_path: string;
  caption: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
};

export type FakeDb = {
  gallery_items: GalleryItemRow[];
  /** Aperçus locaux des photos « envoyées » (URL blob:), par image_path. Pas une table. */
  galleryPreviews: Map<string, string>;
};

/** Données de démonstration. */
function seed(now: Date): FakeDb {
  const createdAt = now.toISOString();
  return {
    gallery_items: [1, 2, 3].map((n) => ({
      id: randomUuid(),
      image_path: `demo/creation-${n}.jpg`,
      caption: `Création de démonstration n° ${n}`,
      sort_order: n,
      published: true,
      created_at: createdAt,
    })),
    galleryPreviews: new Map(),
  };
}

let db: FakeDb | null = null;

/** La fausse base, créée au premier accès. */
export function fakeDb(): FakeDb {
  db ??= seed(new Date());
  return db;
}

/** Repart de données neuves, calculées à partir de `now` (tests). */
export function resetFakeDb(now: Date = new Date()): FakeDb {
  db = seed(now);
  return db;
}

/**
 * Latence réseau simulée, pour voir les états « chargement » pendant le développement.
 * Nulle dans les tests unitaires (Vitest définit MODE = "test").
 */
export async function fakeLatency(): Promise<void> {
  if (import.meta.env.MODE === "test") return;
  await new Promise((resolve) => setTimeout(resolve, 350));
}
