import { describe, expect, it, vi } from "vitest";
import { AdminError } from "@/features/admin/data";
import {
  addGalleryItem,
  cleanAltText,
  deleteGalleryItem,
  getAdminGallery,
  hideGalleryItem,
  moveGalleryItem,
  setGalleryItemPublished,
  sweepGalleryOrphans,
  updateGalleryItemAltText,
} from "@/features/admin/gallery";
import type { ProcessedImage } from "@/features/gallery/processImage";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  fakeSupabaseClient,
  type FakeQueryResult,
  type FakeStorageResults,
} from "@/test/fakeSupabase";

// Client admin simulé : aucune requête ne part.
vi.mock("@/lib/supabaseAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseAdmin")>()),
  getSupabaseAdmin: vi.fn(),
}));

function mockSupabase(results: Record<string, FakeQueryResult>, storage: FakeStorageResults = {}) {
  const fake = fakeSupabaseClient(results, storage);
  vi.mocked(getSupabaseAdmin).mockReturnValue(fake.client);
  return fake.calls;
}

const methods = (calls: { method: string }[]) =>
  calls.map((c) => c.method).filter((m) => m !== "abortSignal" && m !== "storage.from");

async function expectAdminError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AdminError);
  await expect(promise).rejects.toMatchObject({ code });
}

const UUID_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

const ROW = {
  id: "c0000000-0000-4000-8000-000000000001",
  image_path: "a0000000-0000-4000-8000-00000000000a.webp",
  alt_text: "Dégradé court",
  width: 1200,
  height: 900,
  sort_order: 1,
  published: true,
  consent_at: "2026-10-11T10:00:00+00:00",
  created_at: "2026-10-11T10:00:00+00:00",
};

/** Image « traitée » factice (aucune vraie photo). */
const IMAGE: ProcessedImage = {
  blob: new Blob([new Uint8Array(10)], { type: "image/webp" }),
  type: "image/webp",
  extension: "webp",
  width: 1200,
  height: 900,
};

describe("cleanAltText", () => {
  it("retire les espaces autour et refuse vide ou trop long", () => {
    expect(cleanAltText("  Dégradé  ")).toBe("Dégradé");
    expect(() => cleanAltText("   ")).toThrow(AdminError);
    expect(() => cleanAltText("a".repeat(201))).toThrow(AdminError);
    expect(cleanAltText("a".repeat(200))).toHaveLength(200);
  });
});

describe("getAdminGallery", () => {
  it("liste toutes les photos avec une URL signée", async () => {
    const calls = mockSupabase(
      { admin_list_gallery_items: { data: [ROW], error: null } },
      {
        createSignedUrls: {
          data: [{ path: ROW.image_path, signedUrl: "https://example.test/s", error: null }],
          error: null,
        },
      },
    );
    await expect(getAdminGallery()).resolves.toEqual([
      {
        id: ROW.id,
        imagePath: ROW.image_path,
        imageUrl: "https://example.test/s",
        altText: "Dégradé court",
        width: 1200,
        height: 900,
        sortOrder: 1,
        published: true,
        consentAt: ROW.consent_at,
        createdAt: ROW.created_at,
      },
    ]);
    expect(methods(calls)).toEqual(["rpc", "storage.createSignedUrls"]);
  });

  it("garde la liste si la signature échoue (aperçu indisponible)", async () => {
    mockSupabase(
      { admin_list_gallery_items: { data: [ROW], error: null } },
      { createSignedUrls: { data: null, error: { message: "panne" } } },
    );
    const [item] = await getAdminGallery();
    expect(item?.imageUrl).toBeNull();
  });

  it("traduit le refus d'accès en code stable", async () => {
    mockSupabase({
      admin_list_gallery_items: { data: null, error: { code: "42501", message: "forbidden" } },
    });
    await expectAdminError(getAdminGallery(), "forbidden");
  });
});

describe("addGalleryItem", () => {
  it("envoie le fichier sous un nom uuid, PUIS crée la ligne", async () => {
    const calls = mockSupabase({ admin_add_gallery_item: { data: [ROW], error: null } });
    await addGalleryItem({ image: IMAGE, altText: "  Dégradé court ", consent: true });

    expect(methods(calls)).toEqual(["storage.upload", "rpc"]);
    const [path, body, options] = calls.find((c) => c.method === "storage.upload")!.args;
    expect(path).toMatch(UUID_PATH);
    expect(body).toBe(IMAGE.blob);
    expect(options).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(calls.find((c) => c.method === "rpc")!.args).toEqual([
      "admin_add_gallery_item",
      {
        p_image_path: path,
        p_alt_text: "Dégradé court",
        p_width: 1200,
        p_height: 900,
        p_consent: true,
      },
    ]);
  });

  it("refuse un texte alternatif vide AVANT tout envoi", async () => {
    const calls = mockSupabase({});
    await expectAdminError(
      addGalleryItem({ image: IMAGE, altText: " ", consent: true }),
      "invalid_input",
    );
    expect(calls).toHaveLength(0);
  });

  it("envoi refusé par Storage : code stable, aucune ligne créée", async () => {
    const calls = mockSupabase(
      {},
      { upload: { data: null, error: { message: "new row violates row-level security policy" } } },
    );
    await expectAdminError(
      addGalleryItem({ image: IMAGE, altText: "Coupe", consent: false }),
      "upload_failed",
    );
    expect(methods(calls)).toEqual(["storage.upload"]);
  });

  it("ligne refusée (limite atteinte) : le fichier envoyé est effacé", async () => {
    const calls = mockSupabase({
      admin_add_gallery_item: {
        data: null,
        error: { code: "P0001", message: "gallery_limit_reached" },
      },
    });
    await expectAdminError(
      addGalleryItem({ image: IMAGE, altText: "Coupe", consent: false }),
      "gallery_limit_reached",
    );
    expect(methods(calls)).toEqual(["storage.upload", "rpc", "storage.remove"]);
    const uploaded = calls.find((c) => c.method === "storage.upload")!.args[0];
    expect(calls.find((c) => c.method === "storage.remove")!.args[0]).toEqual([uploaded]);
  });

  it("coupure réseau (réponse perdue) : le fichier est GARDÉ, la ligne a pu être créée", async () => {
    // supabase-js signale une coupure par une erreur SANS code : la base n'a peut-être rien
    // reçu, ou a créé la ligne sans que la réponse revienne. Effacer le fichier casserait
    // alors une photo publiée ; le ramassage des orphelins efface le fichier s'il est seul.
    const calls = mockSupabase({
      admin_add_gallery_item: {
        data: null,
        error: { code: "", message: "TypeError: Failed to fetch" },
      },
    });
    await expectAdminError(
      addGalleryItem({ image: IMAGE, altText: "Coupe", consent: true }),
      "unknown",
    );
    expect(methods(calls)).toEqual(["storage.upload", "rpc"]);
  });
});

describe("écritures admin", () => {
  it("publier transmet l'accord ; consent_required est traduit", async () => {
    const calls = mockSupabase({ admin_set_gallery_item_published: { data: null, error: null } });
    await setGalleryItemPublished(ROW.id, true, true);
    expect(calls[0]?.args).toEqual([
      "admin_set_gallery_item_published",
      { p_id: ROW.id, p_published: true, p_consent: true },
    ]);

    mockSupabase({
      admin_set_gallery_item_published: {
        data: null,
        error: { code: "P0001", message: "consent_required" },
      },
    });
    await expectAdminError(setGalleryItemPublished(ROW.id, true, false), "consent_required");
  });

  it("modifier le texte alternatif le nettoie d'abord", async () => {
    const calls = mockSupabase({ admin_update_gallery_item_alt: { data: null, error: null } });
    await updateGalleryItemAltText(ROW.id, "  Contours nets ");
    expect(calls[0]?.args).toEqual([
      "admin_update_gallery_item_alt",
      { p_id: ROW.id, p_alt_text: "Contours nets" },
    ]);
  });

  it("monter / descendre renvoie si la photo a bougé", async () => {
    mockSupabase({ admin_move_gallery_item: { data: false, error: null } });
    await expect(moveGalleryItem(ROW.id, "up")).resolves.toBe(false);
  });

  it("supprimer : la ligne PUIS le fichier renvoyé par la base", async () => {
    const calls = mockSupabase({
      admin_delete_gallery_item: { data: ROW.image_path, error: null },
    });
    await deleteGalleryItem(ROW.id);
    expect(methods(calls)).toEqual(["rpc", "storage.remove"]);
    expect(calls.find((c) => c.method === "storage.remove")!.args[0]).toEqual([ROW.image_path]);
  });

  it("supprimer : si la ligne échoue, le fichier n'est PAS effacé", async () => {
    const calls = mockSupabase({
      admin_delete_gallery_item: { data: null, error: { code: "P0001", message: "not_found" } },
    });
    await expectAdminError(deleteGalleryItem(ROW.id), "not_found");
    expect(methods(calls)).toEqual(["rpc"]);
  });

  it("une erreur inconnue ne recopie jamais le message de la base", async () => {
    mockSupabase({
      admin_move_gallery_item: {
        data: null,
        error: { code: "XX000", message: "détail interne avec un chemin" },
      },
    });
    const promise = moveGalleryItem(ROW.id, "down");
    await expectAdminError(promise, "unknown");
    await expect(promise).rejects.toHaveProperty("message", "unknown");
  });
});

describe("hideGalleryItem", () => {
  const ITEM = {
    id: ROW.id,
    imagePath: ROW.image_path,
    imageUrl: "https://example.test/ancien",
    altText: ROW.alt_text,
    width: 1200,
    height: 900,
    sortOrder: 1,
    published: true,
    consentAt: ROW.consent_at,
    createdAt: ROW.created_at,
  };

  it("copie sous un nouvel uuid, pointe la ligne dessus, PUIS efface l'ancien fichier", async () => {
    const calls = mockSupabase(
      { admin_hide_gallery_item: { data: ROW.image_path, error: null } },
      {
        copy: { data: { path: "x" }, error: null },
        remove: { data: [{ name: ROW.image_path }], error: null },
        createSignedUrls: { data: [], error: null },
      },
    );
    const result = await hideGalleryItem(ITEM);

    expect(methods(calls)).toEqual([
      "storage.copy",
      "rpc",
      "storage.remove",
      "storage.createSignedUrls",
    ]);
    const [from, to] = calls.find((c) => c.method === "storage.copy")!.args as string[];
    expect(from).toBe(ROW.image_path);
    expect(to).toMatch(UUID_PATH);
    expect(to).not.toBe(ROW.image_path);
    expect(calls.find((c) => c.method === "rpc")!.args).toEqual([
      "admin_hide_gallery_item",
      { p_id: ROW.id, p_new_path: to },
    ]);
    expect(calls.find((c) => c.method === "storage.remove")!.args[0]).toEqual([ROW.image_path]);
    expect(result).toMatchObject({ imagePath: to, linksRevoked: true });
  });

  it("garde l'extension d'un JPEG", async () => {
    const calls = mockSupabase(
      { admin_hide_gallery_item: { data: "a.jpg", error: null } },
      { copy: { data: {}, error: null }, remove: { data: [], error: null } },
    );
    await hideGalleryItem({ ...ITEM, imagePath: "a0000000-0000-4000-8000-00000000000a.jpg" });
    expect(calls.find((c) => c.method === "storage.copy")!.args[1]).toMatch(/.jpg$/);
  });

  it("copie impossible : masque quand même, en signalant que les liens ne sont pas coupés", async () => {
    const calls = mockSupabase(
      { admin_set_gallery_item_published: { data: null, error: null } },
      { copy: { data: null, error: { message: "réseau" } } },
    );
    await expect(hideGalleryItem(ITEM)).resolves.toEqual({
      imagePath: ITEM.imagePath,
      imageUrl: ITEM.imageUrl,
      linksRevoked: false,
    });
    expect(calls.find((c) => c.method === "rpc")!.args).toEqual([
      "admin_set_gallery_item_published",
      { p_id: ROW.id, p_published: false, p_consent: false },
    ]);
  });

  it("refus de la base : la copie est effacée, l'ancien fichier reste", async () => {
    const calls = mockSupabase(
      { admin_hide_gallery_item: { data: null, error: { code: "P0001", message: "not_found" } } },
      { copy: { data: {}, error: null } },
    );
    await expectAdminError(hideGalleryItem(ITEM), "not_found");
    const copied = calls.find((c) => c.method === "storage.copy")!.args[1];
    expect(calls.filter((c) => c.method === "storage.remove").map((c) => c.args[0])).toEqual([
      [copied],
    ]);
  });

  it("ancien fichier non effacé : linksRevoked false (ramassé plus tard)", async () => {
    mockSupabase(
      { admin_hide_gallery_item: { data: ROW.image_path, error: null } },
      { copy: { data: {}, error: null }, remove: { data: null, error: { message: "panne" } } },
    );
    await expect(hideGalleryItem(ITEM)).resolves.toMatchObject({ linksRevoked: false });
  });
});

describe("sweepGalleryOrphans", () => {
  it("efface les fichiers sans ligne signalés par la base", async () => {
    const calls = mockSupabase(
      { admin_gallery_orphans: { data: [ROW.image_path], error: null } },
      { remove: { data: [{ name: ROW.image_path }], error: null } },
    );
    await expect(sweepGalleryOrphans()).resolves.toBe(1);
    expect(calls.find((c) => c.method === "storage.remove")!.args[0]).toEqual([ROW.image_path]);
  });

  it("rien à faire, ou panne : 0, sans erreur", async () => {
    const calls = mockSupabase({ admin_gallery_orphans: { data: [], error: null } });
    await expect(sweepGalleryOrphans()).resolves.toBe(0);
    expect(methods(calls)).toEqual(["rpc"]);

    mockSupabase({ admin_gallery_orphans: { data: null, error: { message: "panne" } } });
    await expect(sweepGalleryOrphans()).resolves.toBe(0);

    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new Error("config absente");
    });
    await expect(sweepGalleryOrphans()).resolves.toBe(0);
  });
});
