import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  mockStorage,
  rpcError,
  test,
} from "./fixtures.ts";

/**
 * Galerie côté admin (Android, iPhone, desktop). Supabase SIMULÉ : auth, RPC
 * `admin_*_gallery_*` et Storage interceptés ; tout autre appel est coupé par le filet de
 * e2e/fixtures.ts. AUCUNE vraie photo : les images sont dessinées par un canvas dans la page
 * (deux rectangles de couleur), puis on y ajoute un bloc EXIF fabriqué ici.
 */

const UUID_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$/;
const ALLOWED_HOSTS = new Set(["localhost:5173", "supabase-e2e.invalid"]);

function row(id: string, altText: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    image_path: `${id.slice(0, 8)}-0000-4000-8000-000000000000.webp`,
    alt_text: altText,
    width: 1200,
    height: 900,
    sort_order: 1,
    published: true,
    consent_at: "2030-01-10T10:00:00+00:00",
    created_at: "2030-01-10T10:00:00+00:00",
    ...fields,
  };
}

/** Prépare la fausse API, se connecte et ouvre /admin/galerie. */
async function ouvrirGalerie(page: Page, rows: Record<string, unknown>[] = []) {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const record = (name: string) => (args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
  };
  let list = rows;

  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  const storage = await mockStorage(page);
  await mockRpc(page, "admin_list_gallery_items", () => ({ body: list }));
  await mockRpc(page, "admin_gallery_orphans", () => ({ body: [] }));
  await mockRpc(page, "admin_add_gallery_item", (args) => {
    record("add")(args);
    const added = row("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", String(args.p_alt_text), {
      image_path: args.p_image_path,
      width: args.p_width,
      height: args.p_height,
      published: args.p_consent,
    });
    list = [...list, added];
    return { body: [added] };
  });
  for (const name of ["admin_set_gallery_item_published", "admin_update_gallery_item_alt"]) {
    await mockRpc(page, name, (args) => {
      record(name)(args);
      return { body: null };
    });
  }
  await mockRpc(page, "admin_move_gallery_item", (args) => {
    record("admin_move_gallery_item")(args);
    return { body: true };
  });
  await mockRpc(page, "admin_hide_gallery_item", (args) => {
    record("admin_hide_gallery_item")(args);
    const old = list.find((r) => r.id === args.p_id);
    list = list.map((r) =>
      r.id === args.p_id ? { ...r, image_path: args.p_new_path, published: false } : r,
    );
    return { body: old?.image_path ?? null };
  });
  await mockRpc(page, "admin_delete_gallery_item", (args) => {
    record("admin_delete_gallery_item")(args);
    return { body: list.find((r) => r.id === args.p_id)?.image_path ?? null };
  });

  await page.goto("/admin/galerie");
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Galerie" })).toBeVisible();
  return { urls, storage, rpcCalls };
}

/** Dessine une « photo » : fond bleu, quart haut-gauche rouge. Renvoie un JPEG. */
async function dessinerPhoto(page: Page, width: number, height: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ w, h }) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#2040c0";
      context.fillRect(0, 0, w, h);
      context.fillStyle = "#d02020";
      context.fillRect(0, 0, w / 2, h / 2);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      return Array.from(new Uint8Array(await blob!.arrayBuffer()));
    },
    { w: width, h: height },
  );
  return Buffer.from(bytes);
}

/**
 * Ajoute au JPEG un bloc EXIF : orientation 6 (l'appareil était tourné : « faire pivoter de
 * 90° à droite » pour afficher) et une position GPS (latitude « N »), comme un vrai téléphone.
 */
function avecExif(jpeg: Buffer): Buffer {
  // prettier-ignore
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // en-tête TIFF (gros-boutiste), IFD0 en 8
    0x00, 0x02,                                     // IFD0 : 2 entrées
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation = 6
    0x88, 0x25, 0x00, 0x04, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x26, // GPS en 38
    0x00, 0x00, 0x00, 0x00,                         // pas d'IFD suivant
    0x00, 0x01,                                     // IFD GPS : 1 entrée
    0x00, 0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, 0x4e, 0x00, 0x00, 0x00, // LatitudeRef = "N"
    0x00, 0x00, 0x00, 0x00,
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = payload.length + 2;
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
  // Juste après le marqueur de début d'image (FF D8).
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** Octets d'une URL blob: de la page (l'aperçu de la photo préparée). */
async function lireBlob(page: Page, url: string): Promise<Buffer> {
  const bytes = await page.evaluate(async (src) => {
    const response = await fetch(src);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, url);
  return Buffer.from(bytes);
}

/** Couleur d'un pixel de l'image, décodée par le navigateur (sans appliquer d'EXIF). */
async function lireImage(page: Page, image: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ({ bytes, points }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const colors = points.map(([x, y]) => {
        const [r, , b] = context.getImageData(x, y, 1, 1).data;
        return r! > b! ? "rouge" : "bleu";
      });
      return { width: bitmap.width, height: bitmap.height, colors };
    },
    { bytes: Array.from(image), points },
  );
}

test("ajout : photo réduite à 1200 px, redressée, sans EXIF ni GPS, nom uuid, publiée avec accord", async ({
  page,
}) => {
  const { urls, storage, rpcCalls } = await ouvrirGalerie(page);
  await expect(page.getByText("Ajoute ta première photo")).toBeVisible();

  // 2400 × 1600 « couchée » + EXIF orientation 6 : à l'écran, 1600 × 2400 debout.
  const photo = avecExif(await dessinerPhoto(page, 2400, 1600));
  await page.locator("#photo-library").setInputFiles({
    name: "IMG_2031 Léa Martin.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const apercu = page.getByRole("img", { name: "Aperçu de la photo choisie" });
  await expect(apercu).toBeVisible();
  // L'aperçu affiche le Blob EXACT qui sera envoyé (URL blob:) : on lit ses octets ici, car
  // WebKit (Playwright) ne montre pas le contenu des fichiers dans les requêtes interceptées.
  const image = await lireBlob(page, (await apercu.getAttribute("src"))!);

  const publier = page.getByRole("button", { name: "Publier", exact: true });
  // Sans l'accord, rien ne part : message relié à la case, qui reçoit le focus.
  await publier.click();
  await expect(
    page.getByText("Coche l'accord de la personne photographiée pour publier."),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /d'accord/ })).toBeFocused();
  expect(storage.uploads).toEqual([]);
  await page.getByText("La personne photographiée est d'accord pour la publication.").click();
  await page.getByLabel("Texte alternatif (obligatoire)").fill("Dégradé bas, côtés rasés");
  await publier.click();
  await expect(page.getByText("Photo publiée dans la galerie.")).toBeVisible();

  // Fichier envoyé : nom uuid (jamais le nom d'origine), sans remplacement.
  expect(storage.uploads).toHaveLength(1);
  const upload = storage.uploads[0]!;
  expect(upload.path).toMatch(UUID_FILE);
  expect(upload.upsert).toBe("false");
  expect(upload.body.includes("Léa")).toBe(false);
  expect(upload.body.includes("IMG_2031")).toBe(false);

  // C'est bien ce Blob qui part (vérifiable là où le navigateur expose le corps : Chromium).
  if (upload.body.length > image.length) expect(upload.body.includes(image)).toBe(true);

  // Contenu : le format annoncé par l'extension, aucune trace EXIF (ni bloc, ni en-tête TIFF).
  if (upload.path.endsWith(".webp")) {
    expect(image.subarray(8, 12).toString("latin1")).toBe("WEBP");
  } else {
    expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  }
  expect(image.includes("Exif")).toBe(false);
  expect(image.includes(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe(false);

  // Redressée : 800 × 1200, et le coin rouge (haut-gauche de la photo couchée) est passé en
  // haut à DROITE, comme sur l'écran du téléphone.
  const lu = await lireImage(page, image, [
    [790, 10],
    [10, 10],
    [10, 1190],
  ]);
  expect(lu).toEqual({ width: 800, height: 1200, colors: ["rouge", "bleu", "bleu"] });

  expect(rpcCalls).toEqual([
    {
      name: "add",
      args: {
        p_image_path: upload.path,
        p_alt_text: "Dégradé bas, côtés rasés",
        p_width: 800,
        p_height: 1200,
        p_consent: true,
      },
    },
  ]);
  // La nouvelle photo apparaît dans la liste (relue), avec son URL signée.
  await expect(page.getByRole("img", { name: "Dégradé bas, côtés rasés" })).toBeVisible();
  expect(storage.signings.at(-1)).toEqual([upload.path]);

  // Aucune requête vers un tiers.
  expect(
    urls.filter(
      (url) =>
        !ALLOWED_HOSTS.has(new URL(url).host) &&
        !url.startsWith("blob:") &&
        !url.startsWith("data:"),
    ),
  ).toEqual([]);
});

test("fichier refusé : un SVG (même renommé en .jpg) ne part jamais", async ({ page }) => {
  const { storage, rpcCalls } = await ouvrirGalerie(page);
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
  );

  await page.locator("#photo-library").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: svg,
  });
  await expect(page.getByRole("alert")).toContainText("pas une photo JPEG, PNG ou WebP");

  await page.locator("#photo-camera").setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: svg,
  });
  await expect(page.getByRole("alert")).toContainText("pas une photo JPEG, PNG ou WebP");
  await expect(page.getByRole("img", { name: "Aperçu de la photo choisie" })).toHaveCount(0);
  expect(storage.uploads).toEqual([]);
  expect(rpcCalls).toEqual([]);
});

test("envoi refusé par la base (galerie pleine) : message, fichier effacé", async ({ page }) => {
  const { storage } = await ouvrirGalerie(page);
  await mockRpc(page, "admin_add_gallery_item", () => rpcError("gallery_limit_reached"));

  await page.locator("#photo-library").setInputFiles({
    name: "a.jpg",
    mimeType: "image/jpeg",
    buffer: await dessinerPhoto(page, 600, 400),
  });
  await page.getByLabel("Texte alternatif (obligatoire)").fill("Coupe courte");
  await page.getByRole("button", { name: "Enregistrer sans publier" }).click();
  await expect(page.getByRole("alert")).toContainText("La galerie est pleine");
  expect(storage.removals).toEqual([[storage.uploads[0]!.path]]);
});

test("liste : monter / descendre, publier avec accord, masquer, supprimer avec confirmation", async ({
  page,
}) => {
  const rows = [
    row("c0000001-0000-4000-8000-000000000001", "Dégradé court"),
    row("c0000002-0000-4000-8000-000000000002", "Contours nets", {
      published: false,
      consent_at: null,
    }),
    row("c0000003-0000-4000-8000-000000000003", "Barbe taillée"),
  ];
  const { storage, rpcCalls } = await ouvrirGalerie(page, rows);
  await expect(page.getByText("3 photos, dont 2 publiées.")).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  // Monter / descendre : boutons de 44 px au moins, focus conservé après le déplacement.
  const descendre = page.getByRole("button", { name: "Descendre la photo 1" });
  const box = await descendre.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await descendre.click();
  await expect(page.getByRole("button", { name: "Descendre la photo 2" })).toBeFocused();
  const photos = page.getByRole("region", { name: "Photos" }).getByRole("listitem");
  await expect(photos.nth(1)).toContainText("Dégradé court");

  // Publier une photo masquée : l'accord est exigé.
  await page.getByRole("button", { name: "Publier la photo 1" }).click();
  const confirmer = page.getByRole("button", { name: "Publier", exact: true });
  await expect(page.getByRole("checkbox", { name: /d'accord/ })).toBeFocused();
  await page.getByText("La personne photographiée est d'accord pour la publication.").click();
  await confirmer.click();
  await expect(page.getByText("3 photos, dont 3 publiées.")).toBeVisible();

  // Supprimer : confirmation, puis la ligne, puis le fichier.
  await page.getByRole("button", { name: "Supprimer la photo 3" }).click();
  await page.getByRole("button", { name: "Oui, supprimer" }).click();
  await expect(page.getByText("2 photos, dont 2 publiées.")).toBeVisible();

  // Masquer une photo publiée : copie sous un nouveau nom, la ligne pointe dessus, l'ancien
  // fichier est effacé (les URL signées déjà distribuées meurent avec lui).
  await page.getByRole("button", { name: "Masquer la photo 1" }).click();
  await expect(page.getByText(/ne fonctionnent plus/)).toBeVisible();
  await expect(page.getByText("2 photos, dont 1 publiée.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publier la photo 1" })).toBeFocused();
  expect(storage.copies).toHaveLength(1);
  const [source, copie] = storage.copies[0]!;
  expect(source).toBe(rows[1]!.image_path);
  expect(copie).toMatch(UUID_FILE);

  expect(rpcCalls).toEqual([
    {
      name: "admin_move_gallery_item",
      args: { p_id: rows[0]!.id, p_direction: "down" },
    },
    {
      name: "admin_set_gallery_item_published",
      args: { p_id: rows[1]!.id, p_published: true, p_consent: true },
    },
    { name: "admin_delete_gallery_item", args: { p_id: rows[2]!.id } },
    { name: "admin_hide_gallery_item", args: { p_id: rows[1]!.id, p_new_path: copie } },
  ]);
  expect(storage.removals).toEqual([[rows[2]!.image_path], [rows[1]!.image_path]]);
});
