import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  test,
  type AdminAuthCalls,
} from "./fixtures.ts";

/**
 * Espace admin (Android, iPhone, desktop) : connexion Supabase Auth SIMULÉE (e2e/fixtures.ts,
 * `mockAdminAuth`), jamais la vraie base. L'horloge du navigateur est fixée (`page.clock`) :
 * l'expiration des jetons et les jours affichés ne dépendent pas de la date du jour.
 * Les disponibilités sont testées dans admin-disponibilites.spec.ts, les rendez-vous dans
 * admin-reservations.spec.ts.
 */

const STORAGE_KEY = "cutsbyalix-admin-auth";

async function preparer(page: Page, options?: { isAdmin?: boolean }): Promise<AdminAuthCalls> {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  return mockAdminAuth(page, options);
}

async function seConnecter(page: Page, email: string, password: string) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

const sessionStockee = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

test("route protégée sans session : redirection vers la connexion, aucune donnée chargée", async ({
  page,
}) => {
  const calls = await preparer(page);
  await page.goto("/admin/rendez-vous");

  await expect(page).toHaveURL(/\/admin\/connexion$/);
  await expect(page.getByRole("heading", { level: 1, name: "Espace admin" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toHaveCount(0);
  // Sans session, on ne demande même pas la table admins.
  expect(calls.adminChecks).toBe(0);
  // noindex et manifeste PWA sur la connexion.
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/admin.webmanifest",
  );
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
});

test("mauvais identifiants : le même message neutre pour tous les cas", async ({ page }) => {
  await preparer(page);
  await page.goto("/admin/connexion");

  const message = page.getByRole("alert");
  await seConnecter(page, FAKE_ADMIN.email, "mauvais mot de passe");
  await expect(message).toHaveText("E-mail ou mot de passe incorrect.");
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");

  await seConnecter(page, "inconnu@example.test", "un mot de passe");
  await expect(message).toHaveText("E-mail ou mot de passe incorrect.");
  expect(await sessionStockee(page)).toBeNull();
});

test("compte valide mais absent de admins : refusé avec le même message, session effacée", async ({
  page,
}) => {
  const calls = await preparer(page, { isAdmin: false });
  await page.goto("/admin/connexion");

  await seConnecter(page, FAKE_ADMIN.email, FAKE_ADMIN.password);
  await expect(page.getByRole("alert")).toHaveText("E-mail ou mot de passe incorrect.");
  await expect(page).toHaveURL(/\/admin\/connexion$/);
  expect(calls.logouts).toEqual(["local"]);
  expect(await sessionStockee(page)).toBeNull();
});

test("connexion, session conservée à la réouverture, puis déconnexion qui l'efface", async ({
  page,
}) => {
  const calls = await preparer(page);
  await page.goto("/admin/rendez-vous");
  await expect(page).toHaveURL(/\/admin\/connexion$/);

  // Afficher / masquer le mot de passe avant d'envoyer.
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "text");
  await seConnecter(page, FAKE_ADMIN.email, FAKE_ADMIN.password);

  // Retour à la page demandée au départ.
  await expect(page).toHaveURL(/\/admin\/rendez-vous$/);
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
  expect(await sessionStockee(page)).not.toBeNull();

  // « Fermer et rouvrir » : on quitte complètement l'application (page vide : plus rien en
  // mémoire), puis on revient. Seul le localStorage a survécu. Pas de nouvelle connexion.
  const logins = calls.passwordLogins.length;
  await page.goto("about:blank");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  expect(calls.passwordLogins.length).toBe(logins);

  // Le jeton n'apparaît dans aucune URL.
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
  expect(urls.filter((url) => url.includes(calls.accessToken))).toEqual([]);

  await page
    .getByRole("navigation", { name: "Navigation admin" })
    .getByRole("link", { name: "Compte" })
    .click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/admin\/connexion$/);
  expect(calls.logouts).toContain("local");
  expect(await sessionStockee(page)).toBeNull();

  // Après la déconnexion, la route protégée renvoie à la connexion.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/connexion$/);
});

test("changement de mot de passe : ancien vérifié, 12 caractères, autres appareils déconnectés", async ({
  page,
}) => {
  const calls = await preparer(page);
  await page.goto("/admin/connexion");
  await seConnecter(page, FAKE_ADMIN.email, FAKE_ADMIN.password);
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigation admin" })
    .getByRole("link", { name: "Compte" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();

  const actuel = page.getByLabel("Mot de passe actuel", { exact: true });
  const nouveau = page.getByLabel("Nouveau mot de passe", { exact: true });
  const confirmation = page.getByLabel("Confirme le nouveau mot de passe");
  const envoyer = page.getByRole("button", { name: "Changer le mot de passe" });

  // Trop court : refusé sans rien envoyer.
  await actuel.fill(FAKE_ADMIN.password);
  await nouveau.fill("trop court");
  await confirmation.fill("trop court");
  await envoyer.click();
  await expect(page.getByText("12 caractères minimum.", { exact: true })).toBeVisible();
  expect(calls.passwordUpdates).toEqual([]);

  // Ancien mot de passe faux.
  await actuel.fill("ce n'est pas le bon");
  await nouveau.fill("nouvelle phrase factice");
  await confirmation.fill("nouvelle phrase factice");
  await envoyer.click();
  await expect(page.getByText("Mot de passe actuel incorrect.")).toBeVisible();
  expect(calls.passwordUpdates).toEqual([]);

  // Succès.
  await actuel.fill(FAKE_ADMIN.password);
  await nouveau.fill("nouvelle phrase factice");
  await confirmation.fill("nouvelle phrase factice");
  await envoyer.click();
  await expect(page.getByRole("status")).toHaveText(
    "Mot de passe modifié. Tes autres appareils ont été déconnectés.",
  );
  expect(calls.passwordUpdates).toEqual(["nouvelle phrase factice"]);
  expect(calls.logouts).toEqual(["others"]);
  // Ce téléphone reste connecté.
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
});

test("le manifeste PWA n'est lié que depuis l'espace admin", async ({ page }) => {
  await preparer(page);
  for (const chemin of ["/", "/reserver", "/mentions-legales"]) {
    await page.goto(chemin);
    await expect(page.locator('head link[rel="manifest"]'), chemin).toHaveCount(0);
    await expect(page.locator('head meta[name="robots"]'), chemin).toHaveCount(0);
  }
  const manifeste = await (await page.request.get("/admin.webmanifest")).json();
  expect(manifeste).toMatchObject({
    name: "Cuts by Alix — Admin",
    start_url: "/admin",
    display: "standalone",
  });
});

test("connecté : tableau de bord accessible, lien vers les disponibilités", async ({ page }) => {
  await preparer(page);
  await mockRpc(page, "admin_list_bookings", () => ({ body: [] }));
  await page.goto("/admin");
  await seConnecter(page, FAKE_ADMIN.email, FAKE_ADMIN.password);

  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Aujourd'hui" })).toBeVisible();
  await expect(page.getByText("Aucun rendez-vous aujourd'hui.")).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  // Parcours complet des disponibilités (Supabase simulé) : e2e/admin-disponibilites.spec.ts.
  const nav = page.getByRole("navigation", { name: "Navigation admin" });
  await nav.getByRole("link", { name: "Dispos" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Disponibilités" })).toBeVisible();
});
