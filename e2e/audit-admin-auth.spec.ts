import type { Page } from "@playwright/test";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  TECHNICAL_TEXT,
  test,
} from "./fixtures.ts";

/**
 * Audit (consigne 23, docs/AUDIT-2026-10.md §B) : connexion et session admin, cas non couverts
 * par e2e/admin.spec.ts : chaque route sans session, session expirée, jeton révoqué, deux
 * onglets, Retour après déconnexion, 401 pendant l'utilisation. Supabase Auth SIMULÉ.
 */

const STORAGE_KEY = "cutsbyalix-admin-auth";
const ADMIN_ROUTES = [
  "/admin",
  "/admin/rendez-vous",
  "/admin/rendez-vous/e2e00000-0000-4000-8000-0000000000b1",
  "/admin/disponibilites",
  "/admin/galerie",
  "/admin/compte",
];

async function mockAdminData(page: Page) {
  await mockRpc(page, "admin_list_bookings", () => ({ body: [] }));
}

async function login(page: Page, path = "/admin") {
  await page.goto(path);
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
}

/** La déconnexion est dans « Compte ». */
async function logout(page: Page) {
  await page
    .getByRole("navigation", { name: "Navigation admin" })
    .getByRole("link", { name: "Compte" })
    .click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
}

const storedSession = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

test("accès direct à chaque route admin sans session : connexion, aucune donnée demandée", async ({
  page,
}) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  const calls = await mockAdminAuth(page);
  const dataRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/rest\/v1\/(rpc\/admin_|locations|availabilities|bookings)/.test(request.url())) {
      dataRequests.push(request.url());
    }
  });
  for (const route of ADMIN_ROUTES) {
    await page.goto(route);
    await expect(page, route).toHaveURL(/\/admin\/connexion$/);
    await expect(page.getByRole("navigation", { name: "Navigation admin" })).toHaveCount(0);
  }
  expect(dataRequests).toEqual([]);
  expect(calls.adminChecks).toBe(0);
});

test("compte inexistant et mauvais mot de passe : réponses indiscernables à l'écran", async ({
  page,
}) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await page.goto("/admin/connexion");

  const attempt = async (email: string, password: string) => {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    const snapshot = {
      text: await alert.innerText(),
      // Le reste de la page aussi : aucun indice (champ mis en avant, aide différente…).
      page: (await page.locator("main").innerText()).replaceAll(email, "<email>"),
    };
    await page.reload();
    return snapshot;
  };
  const unknown = await attempt("inconnu@example.test", "mot de passe quelconque");
  const wrongPassword = await attempt(FAKE_ADMIN.email, "mauvais mot de passe");
  expect(unknown).toEqual(wrongPassword);
  expect(unknown.text).not.toMatch(TECHNICAL_TEXT);
  expect(unknown.text).not.toMatch(/inconnu|n'existe pas|introuvable/i);
});

test("session expirée et rafraîchissement refusé (jeton révoqué) : retour à la connexion, session effacée", async ({
  page,
}) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockAdminData(page);
  await login(page);
  expect(await storedSession(page)).not.toBeNull();

  // Deux heures plus tard (jeton d'accès expiré après 1 h), et le serveur refuse désormais le
  // jeton de rafraîchissement (déconnecté ailleurs, mot de passe changé…).
  await mockAdminAuth(page, { revoked: true });
  await page.clock.setSystemTime(new Date(ADMIN_TEST_NOW.getTime() + 2 * 3_600_000));
  await page.reload();

  await expect(page).toHaveURL(/\/admin\/connexion$/);
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toHaveCount(0);
  expect(await storedSession(page)).toBeNull();
  expect(await page.locator("body").innerText()).not.toMatch(TECHNICAL_TEXT);
});

test("déconnexion puis bouton Retour : aucune page admin ne réapparaît", async ({ page }) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockAdminData(page);
  await login(page, "/admin/rendez-vous");
  await logout(page);
  await expect(page).toHaveURL(/\/admin\/connexion$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/connexion$/);
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toHaveCount(0);
});

test("deux onglets : la déconnexion dans l'un ferme aussi l'autre", async ({ page, context }) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockAdminData(page);
  await login(page, "/admin/rendez-vous");

  const second = await context.newPage();
  await mockAdminAuth(second);
  await mockAdminData(second);
  await second.goto("/admin/rendez-vous");
  await expect(second.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();

  await logout(page);
  await expect(page).toHaveURL(/\/admin\/connexion$/);

  // L'autre onglet n'est pas rechargé : supabase-js y apprend la déconnexion par l'événement
  // `storage` (localStorage partagé) et le site le renvoie aussitôt à la connexion.
  await expect(second).toHaveURL(/\/admin\/connexion$/);
  await expect(second.getByRole("navigation", { name: "Navigation admin" })).toHaveCount(0);
});

test("jeton refusé par la base (401) pendant l'utilisation : retour à la connexion", async ({
  page,
}) => {
  test.skip(
    true,
    "Constat B-02 (docs/AUDIT-2026-10.md) : un 401 sur une RPC admin affiche « Réessayer » en boucle au lieu de renvoyer à la connexion",
  );
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockRpc(page, "admin_list_bookings", () => ({
    status: 401,
    body: { code: "PGRST301", message: "JWT expired", details: null, hint: null },
  }));
  await login(page, "/admin/rendez-vous");
  await expect(page).toHaveURL(/\/admin\/connexion$/);
});
