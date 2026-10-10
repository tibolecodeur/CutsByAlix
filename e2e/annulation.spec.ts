import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/**
 * Les 4 états de /annuler, sur mobile, avec les liens de démonstration de la fausse base
 * (FAKE_CANCEL_TOKENS dans src/lib/fakeDb.ts, recopiés ici : le test reste « boîte noire »).
 */
test.skip(({ isMobile }) => !isMobile, "Parcours testé sur les projets mobiles");

const TOKENS = {
  valid: "11111111-1111-4111-8111-111111111111",
  cancelled: "22222222-2222-4222-8222-222222222222",
  tooLate: "33333333-3333-4333-8333-333333333333",
  unknown: "00000000-0000-4000-8000-000000000000",
};

async function expectNoAxeViolation(page: Page) {
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
}

test("lien valide : détail du RDV, puis annulation", async ({ page }) => {
  await page.goto(`/annuler?token=${TOKENS.valid}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" }),
  ).toBeVisible();
  await expect(page.getByText("Coupe + barbe")).toBeVisible();
  await expect(page.getByText("Angers")).toBeVisible();
  // Adresse privée jamais affichée tant que la règle de révélation n'est pas décidée.
  await expect(page.getByText(/adresse fictive/)).toHaveCount(0);
  await expectNoAxeViolation(page);

  await page.getByRole("button", { name: "Annuler mon rendez-vous" }).click();
  await expect(page.getByText("L'annulation est définitive. Tu confirmes ?")).toBeVisible();
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Réserver un créneau" })).toBeVisible();
});

test("RDV déjà annulé", async ({ page }) => {
  await page.goto(`/annuler?token=${TOKENS.cancelled}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Rendez-vous déjà annulé" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
  await expectNoAxeViolation(page);
});

test("trop tard : moins de 24 h avant le RDV", async ({ page }) => {
  await page.goto(`/annuler?token=${TOKENS.tooLate}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Trop tard pour annuler en ligne" }),
  ).toBeVisible();
  await expect(page.getByText(/jusqu'à 24 h avant/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
  // L'adresse n'est pas rappelée dans cet état.
  await expect(page.getByText(/adresse fictive/)).toHaveCount(0);
  await expectNoAxeViolation(page);
});

for (const [cas, url] of [
  ["sans token", "/annuler"],
  ["token mal formé", "/annuler?token=pas-un-uuid"],
  ["token inconnu", `/annuler?token=${TOKENS.unknown}`],
] as const) {
  test(`lien invalide (${cas})`, async ({ page }) => {
    await page.goto(url);

    await expect(page.getByRole("heading", { level: 2, name: "Lien invalide" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
    await expectNoAxeViolation(page);
  });
}
