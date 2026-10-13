import { expect, mockStorage, mockTable, test } from "./fixtures.ts";

/**
 * Galerie de l'accueil (Android, iPhone, desktop), en visiteur anonyme. Table et Storage
 * simulés ; les images servies sont un PNG de 1 px généré (aucune vraie photo).
 */

const ALLOWED_HOSTS = new Set(["localhost:5173", "supabase-e2e.invalid"]);
const PUBLIEE = "b0000001-0000-4000-8000-000000000001.webp";
const DEPUBLIEE = "b0000002-0000-4000-8000-000000000002.jpg";

test("photos publiées : URL signées, texte alternatif, dimensions, chargement différé", async ({
  page,
}) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  const requested = await mockTable(page, "gallery_items", [
    { id: "1", image_path: PUBLIEE, alt_text: "Dégradé court", width: 1200, height: 900 },
    // Dépubliée entre la lecture et la signature : Storage refuse, la photo est omise.
    { id: "2", image_path: DEPUBLIEE, alt_text: "Barbe taillée", width: 900, height: 1200 },
  ]);
  const storage = await mockStorage(page, { refuse: [DEPUBLIEE] });

  await page.goto("/");
  const galerie = page.getByRole("region", { name: "Galerie" });
  const photo = galerie.getByRole("img", { name: "Dégradé court" });
  await expect(photo).toHaveAttribute("loading", "lazy");
  await expect(photo).toHaveAttribute("width", "1200");
  await expect(photo).toHaveAttribute("height", "900");
  await expect(photo).toHaveAttribute(
    "src",
    `https://supabase-e2e.invalid/storage/v1/object/sign/gallery/${PUBLIEE}?token=jeton-e2e`,
  );
  await expect(galerie.getByRole("img")).toHaveCount(1);

  // Une seule signature pour toutes les photos à chaque chargement (le mode strict de React
  // charge deux fois en développement) ; jamais les colonnes internes.
  expect(new Set(storage.signings.map((paths) => paths.join(",")))).toEqual(
    new Set([`${PUBLIEE},${DEPUBLIEE}`]),
  );
  const select = new URL(requested[0]!).searchParams.get("select");
  expect(select).toBe("id,image_path,alt_text,width,height");

  // L'image se charge quand on arrive sur la galerie (lazy), toujours chez Supabase.
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => storage.downloads).toEqual([PUBLIEE]);
  expect(urls.filter((url) => !ALLOWED_HOSTS.has(new URL(url).host))).toEqual([]);
});

test("aucune photo publiée : photos de la vitrine, servies par notre domaine, aucune signature", async ({
  page,
}) => {
  const storage = await mockStorage(page);
  await page.goto("/");
  const galerie = page.getByRole("region", { name: "Galerie" });
  const photos = galerie.getByRole("img");
  await expect(photos).toHaveCount(7);
  await expect(photos.first()).toHaveAttribute("src", "/media/galerie/coupe-01.webp");
  // Pagination : compteur sous 768 px (point de rupture md), pastilles au-delà.
  if (page.viewportSize()!.width < 768) {
    await expect(galerie.getByText("1 / 7")).toBeVisible();
  } else {
    await expect(galerie.getByRole("button", { name: "Photo 1 sur 7" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  }
  expect(storage.signings).toEqual([]);
});
