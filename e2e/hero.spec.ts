import { expect, test } from "./fixtures.ts";

/**
 * Hero de l'accueil, sur mobile (projets mobile-android et mobile-iphone).
 * Sur desktop, le bouton est dans le hero et non collé en bas : comportement différent.
 */
test.describe("hero mobile", () => {
  test.skip(({ isMobile }) => !isMobile, "comportement propre au mobile");

  test("affiche le logo et UN bouton « Réserver » collé en bas, cliquable", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("#accueil");
    await expect(hero.getByRole("heading", { level: 1, name: "CutsByAlix" })).toBeVisible();

    // Un seul bouton « Réserver » visible à l'écran (les autres sont réservés au desktop).
    const reserver = page
      .getByRole("link", { name: "Réserver", exact: true })
      .filter({ visible: true });
    await expect(reserver).toHaveCount(1);
    await expect(reserver).toBeInViewport();

    // Collé en bas : son bord inférieur est dans les 40 derniers pixels de l'écran.
    const viewport = page.viewportSize()!;
    const boite = (await reserver.boundingBox())!;
    expect(boite.y + boite.height).toBeGreaterThan(viewport.height - 40);
    expect(boite.y + boite.height).toBeLessThanOrEqual(viewport.height);
    expect(boite.height).toBeGreaterThanOrEqual(44);

    await reserver.click();
    await expect(page).toHaveURL("/reserver");
    await expect(page.getByRole("heading", { level: 1, name: "Réserver" })).toBeVisible();
  });
});

/** Médias du hero, sur les trois projets (mobile et desktop). */
test.describe("médias du hero", () => {
  test("animations réduites : poster seul, aucune vidéo", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "CutsByAlix" })).toBeVisible();
    const poster = page.getByTestId("hero-media").locator("img");
    await expect(poster).toHaveAttribute("src", "/media/hero-poster.jpg");
    // Image réellement chargée (une largeur naturelle nulle = fichier introuvable).
    await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(360);
    await expect(page.locator("video")).toHaveCount(0);
  });

  test("vidéo muette, en ligne, en boucle, WebM puis MP4", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const video = page.getByTestId("hero-media").locator("video");
    await expect(video).toHaveAttribute("autoplay");
    await expect(video).toHaveAttribute("loop");
    await expect(video).toHaveAttribute("playsinline");
    await expect(video).toHaveAttribute("preload", "metadata");
    await expect(video).toHaveAttribute("poster", "/media/hero-poster.jpg");
    expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
    expect(
      await video
        .locator("source")
        .evaluateAll((sources) => sources.map((source) => source.getAttribute("src"))),
    ).toEqual(["/media/hero.webm", "/media/hero.mp4"]);
    // L'absence de piste audio est vérifiée sur les fichiers eux-mêmes (heroMedia.files.test.ts).
  });

  test("aucune requête vers un autre domaine", async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    // Notre back-end Supabase n'est pas un tiers : l'accueil y lit prestations et galerie
    // (appels simulés par fixtures.ts, domaine factice de playwright.config.ts). Tout autre
    // domaine en est un.
    const backend = "https://supabase-e2e.invalid";
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith(backend) && !/^(data|blob):/.test(url)) {
        external.push(url);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(external).toEqual([]);
  });
});
