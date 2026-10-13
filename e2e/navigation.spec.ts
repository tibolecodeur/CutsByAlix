import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/** Chaque route, son titre h1 et le titre d'onglet attendu. */
const PAGES = [
  { chemin: "/", h1: "CutsByAlix", onglet: "CutsByAlix" },
  { chemin: "/reserver", h1: "Réserver", onglet: "Réserver · CutsByAlix" },
  {
    chemin: "/annuler",
    h1: "Annuler ma réservation",
    onglet: "Annuler ma réservation · CutsByAlix",
  },
  { chemin: "/admin", h1: "Espace admin", onglet: "Espace admin · CutsByAlix" },
  {
    chemin: "/conditions",
    h1: "Conditions de réservation",
    onglet: "Conditions de réservation · CutsByAlix",
  },
  { chemin: "/mentions-legales", h1: "Mentions légales", onglet: "Mentions légales · CutsByAlix" },
  {
    chemin: "/politique-confidentialite",
    h1: "Politique de confidentialité",
    onglet: "Politique de confidentialité · CutsByAlix",
  },
  {
    chemin: "/une-url-qui-nexiste-pas",
    h1: "Page introuvable",
    onglet: "Page introuvable · CutsByAlix",
  },
];

for (const { chemin, h1, onglet } of PAGES) {
  test(`la page ${chemin} affiche son titre « ${h1} »`, async ({ page }) => {
    const erreurs: string[] = [];
    page.on("pageerror", (e) => erreurs.push(e.message));

    await page.goto(chemin);

    await expect(page.getByRole("heading", { level: 1, name: h1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(onglet);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    expect(erreurs).toEqual([]);
  });

  test(`la page ${chemin} ne déborde pas horizontalement`, async ({ page }) => {
    await page.goto(chemin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}

test("l'accueil contient les sections dans l'ordre attendu", async ({ page }) => {
  await page.goto("/");
  // Attente explicite du rendu : `evaluateAll` lit le DOM tel quel, sans attendre.
  await expect(page.locator("main section[id]")).toHaveCount(4);

  const ids = await page
    .locator("main section[id]")
    .evaluateAll((sections) => sections.map((s) => s.id));
  expect(ids).toEqual(["accueil", "prestations", "galerie", "reserver"]);
});

test("l'accueil affiche les deux prestations avec les prix de la base", async ({ page }) => {
  await page.goto("/");
  const prestations = page.locator("#prestations");

  await expect(prestations.getByRole("heading", { level: 3 })).toHaveText([
    "Coupe",
    "Coupe + barbe",
  ]);
  await expect(prestations.getByText("Prix : 10 €")).toHaveCount(1);
  await expect(prestations.getByText("Prix : 12 €")).toHaveCount(1);
  await expect(prestations.getByText("Prix : À confirmer")).toHaveCount(0);
});

/**
 * Sur mobile (sous 768 px, le point de rupture `md`), les liens sont dans un menu replié :
 * on l'ouvre. La décision vient de la largeur d'écran, connue d'avance, et non d'un
 * `isVisible()` instantané : sur un serveur froid, React n'a pas encore affiché le bouton à
 * cet instant, le menu restait fermé et le clic suivant attendait 30 s (test fragile).
 */
async function ouvrirMenuSiReplie(page: Page) {
  if (page.viewportSize()!.width >= 768) return;
  const bouton = page.getByRole("button", { name: "Menu" });
  await expect(bouton).toBeVisible();
  await bouton.click();
  await expect(bouton).toHaveAttribute("aria-expanded", "true");
}

test("les ancres du menu fonctionnent depuis une autre page", async ({ page }) => {
  await page.goto("/reserver");
  await expect(page.getByRole("heading", { level: 1, name: "Réserver" })).toBeVisible();
  const menu = page.getByRole("navigation", { name: "Navigation principale" });

  await ouvrirMenuSiReplie(page);
  await menu.getByRole("link", { name: "Galerie" }).click();
  await expect(page).toHaveURL("/#galerie");
  await expect(page.getByRole("heading", { level: 2, name: "Galerie" })).toBeInViewport();

  await ouvrirMenuSiReplie(page);
  await menu.getByRole("link", { name: "Réserver", exact: true }).click();
  await expect(page).toHaveURL("/reserver");
  await expect(page.getByRole("heading", { level: 1, name: "Réserver" })).toBeInViewport();
});

test("le pied de page mène aux pages légales", async ({ page }) => {
  await page.goto("/");
  // Les mentions légales renvoient aussi vers la politique de confidentialité : on vise le
  // lien du pied de page.
  const footer = page.getByRole("navigation", { name: "Informations légales" });

  await footer.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page).toHaveURL("/mentions-legales");
  await expect(footer.getByRole("link", { name: "Mentions légales" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await footer.getByRole("link", { name: "Politique de confidentialité" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Politique de confidentialité");
});

test("le lien d'évitement mène au contenu", async ({ page, browserName }) => {
  // Safari ne donne pas le focus aux liens avec Tab par défaut (réglage système).
  test.skip(browserName === "webkit", "Tab ne parcourt pas les liens dans WebKit par défaut");
  await page.goto("/reserver");
  // Page rendue d'abord : un Tab envoyé avant le rendu de React ne trouve pas encore le lien.
  await expect(page.getByRole("heading", { level: 1, name: "Réserver" })).toBeVisible();

  await page.keyboard.press("Tab");
  const lienEvitement = page.getByRole("link", { name: "Aller au contenu" });
  await expect(lienEvitement).toBeFocused();
  await expect(lienEvitement).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenu$/);
});

test("le site public ne contient aucun lien vers l'espace admin", async ({ page }) => {
  for (const chemin of [
    "/",
    "/reserver",
    "/annuler",
    "/conditions",
    "/mentions-legales",
    "/une-url-qui-nexiste-pas",
  ]) {
    await page.goto(chemin);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="/admin"]'), chemin).toHaveCount(0);
  }
});
