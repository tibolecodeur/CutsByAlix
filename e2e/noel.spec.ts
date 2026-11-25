import { expect, mockStorage, test } from "./fixtures.ts";

/**
 * Décorations de Noël (du 1er décembre au 6 janvier, pages publiques seulement). La date est
 * simulée par l'horloge de Playwright : seule `Date` est figée, les animations CSS tournent.
 */

test("en décembre : neige, guirlande et bonnet, sans gêner le parcours", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00+01:00"));
  await mockStorage(page);
  await page.goto("/");

  await expect(page.getByTestId("christmas-garland")).toBeVisible();
  await expect(page.getByTestId("christmas-hat")).toBeVisible();
  const neige = page.getByTestId("snowfall");
  await expect(neige).toBeAttached();
  await expect(neige).toHaveCSS("pointer-events", "none");

  // Aucun débordement horizontal à cause de la guirlande (très large, coupée).
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(deborde).toBe(false);

  // Le bouton « Réserver » se touche à travers la neige.
  await page.getByRole("link", { name: "Réserver" }).last().click();
  await expect(page).toHaveURL(/\/reserver$/);
  await expect(page.getByTestId("christmas-garland")).toBeVisible();
});

test("animations réduites : pas de neige, guirlande fixe", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00+01:00"));
  await mockStorage(page);
  await page.goto("/");
  await expect(page.getByTestId("christmas-garland")).toBeVisible();
  await expect(page.getByTestId("snowfall")).toHaveCount(0);
});

test("hors période (novembre) et dans l'admin : aucune décoration", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-25T10:00:00+01:00"));
  await mockStorage(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("christmas-garland")).toHaveCount(0);
  await expect(page.getByTestId("snowfall")).toHaveCount(0);

  await page.clock.setFixedTime(new Date("2026-12-15T10:00:00+01:00"));
  await page.goto("/admin/connexion");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("snowfall")).toHaveCount(0);
  await expect(page.getByTestId("christmas-garland")).toHaveCount(0);
});
