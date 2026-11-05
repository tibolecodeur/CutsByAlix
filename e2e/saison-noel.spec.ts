import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/**
 * Version de Noël (ADR 0013). Le serveur de test fige VITE_SEASON=base : Noël ne s'affiche que
 * par l'aperçu ?saison=noel, exactement comme Thibault le vérifiera avant décembre.
 */

/** Empreinte des pixels du canvas de neige (nombre de pixels non transparents + somme). */
function snowPixels(page: Page) {
  return page
    .getByTestId("noel-scissor-snow")
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const context = canvas.getContext("2d")!;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i]! > 0) lit++;
        sum = (sum + data[i]! * i) % 1_000_000_007;
      }
      return { lit, sum };
    });
}

test("?saison=noel : des ciseaux tombent sur la vidéo, la page reste utilisable", async ({
  page,
}) => {
  await page.goto("/?saison=noel");
  await expect(page.locator("html")).toHaveAttribute("data-season", "noel");
  const snow = page.getByTestId("noel-scissor-snow");
  await expect(snow).toHaveAttribute("aria-hidden", "true");

  // Des ciseaux sont dessinés, et ils bougent.
  await expect.poll(async () => (await snowPixels(page)).lit).toBeGreaterThan(50);
  const before = await snowPixels(page);
  await page.waitForTimeout(400);
  const after = await snowPixels(page);
  expect(after.sum).not.toBe(before.sum);

  // La neige ne bloque aucun toucher : le bouton « Réserver » reste cliquable.
  await page.getByRole("link", { name: "Réserver" }).last().click();
  await expect(page).toHaveURL(/\/reserver/);
});

test("version de base (VITE_SEASON=base) et ?saison=base : aucune neige", async ({ page }) => {
  for (const url of ["/", "/?saison=base"]) {
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("data-season", "base");
    await expect(page.getByTestId("noel-scissor-snow")).toHaveCount(0);
  }
});

test.describe("animations réduites", () => {
  test.use({ reducedMotion: "reduce" });

  test("les ciseaux restent immobiles", async ({ page }) => {
    await page.goto("/?saison=noel");
    await expect.poll(async () => (await snowPixels(page)).lit).toBeGreaterThan(0);
    const before = await snowPixels(page);
    await page.waitForTimeout(500);
    expect(await snowPixels(page)).toEqual(before);
  });
});
