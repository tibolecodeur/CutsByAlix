import { describe, expect, it, vi } from "vitest";
import { getPublishedGallery, SIGNED_URL_TTL_S } from "@/features/gallery/data";
import { getSupabase } from "@/lib/supabase";
import {
  fakeSupabaseClient,
  type FakeQueryResult,
  type FakeStorageResults,
} from "@/test/fakeSupabase";

// Client anonyme simulé : aucune requête ne part.
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  getSupabase: vi.fn(),
}));

function mockSupabase(result: FakeQueryResult, storage: FakeStorageResults = {}) {
  const fake = fakeSupabaseClient(result, storage);
  vi.mocked(getSupabase).mockReturnValue(fake.client);
  return fake.calls;
}

const asCalls = (calls: { method: string; args: unknown[] }[]) =>
  calls.filter((c) => c.method !== "abortSignal").map(({ method, args }) => [method, ...args]);

const PATH_A = "a0000000-0000-4000-8000-00000000000a.webp";
const PATH_B = "a0000000-0000-4000-8000-00000000000b.jpg";
const ROWS = [
  { id: "1", image_path: PATH_A, alt_text: "Dégradé court", width: 1200, height: 900 },
  { id: "2", image_path: PATH_B, alt_text: "Barbe taillée", width: 900, height: 1200 },
];

describe("getPublishedGallery", () => {
  it("lit les colonnes d'affichage puis signe toutes les URL en une requête", async () => {
    const calls = mockSupabase(
      { data: ROWS, error: null },
      {
        createSignedUrls: {
          data: [
            { path: PATH_A, signedUrl: "https://example.test/a?token=1", error: null },
            { path: PATH_B, signedUrl: "https://example.test/b?token=2", error: null },
          ],
          error: null,
        },
      },
    );

    await expect(getPublishedGallery()).resolves.toEqual([
      {
        id: "1",
        url: "https://example.test/a?token=1",
        altText: "Dégradé court",
        width: 1200,
        height: 900,
      },
      {
        id: "2",
        url: "https://example.test/b?token=2",
        altText: "Barbe taillée",
        width: 900,
        height: 1200,
      },
    ]);
    // Ni `published` ni `consent_at` : anon n'a pas le droit de les lire.
    expect(asCalls(calls)).toEqual([
      ["from", "gallery_items"],
      ["select", "id, image_path, alt_text, width, height"],
      ["order", "sort_order"],
      ["order", "id"],
      ["storage.from", "gallery"],
      ["storage.createSignedUrls", [PATH_A, PATH_B], SIGNED_URL_TTL_S],
    ]);
  });

  it("omet une photo que Storage refuse de signer (dépubliée entre-temps)", async () => {
    mockSupabase(
      { data: ROWS, error: null },
      {
        createSignedUrls: {
          data: [
            { path: PATH_A, signedUrl: "https://example.test/a", error: null },
            { path: PATH_B, signedUrl: null, error: "Object not found" },
          ],
          error: null,
        },
      },
    );
    const photos = await getPublishedGallery();
    expect(photos.map((p) => p.id)).toEqual(["1"]);
  });

  it("aucune photo publiée : liste vide, sans requête de signature", async () => {
    const calls = mockSupabase({ data: [], error: null });
    await expect(getPublishedGallery()).resolves.toEqual([]);
    expect(calls.some((c) => c.method.startsWith("storage."))).toBe(false);
  });

  it("rejette avec un message fixe, jamais le texte brut de Supabase", async () => {
    mockSupabase({ data: null, error: { message: 'relation "gallery_items" secret detail' } });
    await expect(getPublishedGallery()).rejects.toThrow(/^gallery_unavailable$/);

    mockSupabase(
      { data: ROWS, error: null },
      { createSignedUrls: { data: null, error: { message: "bucket interne" } } },
    );
    await expect(getPublishedGallery()).rejects.toThrow(/^gallery_unavailable$/);
  });
});
