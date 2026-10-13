import { E2E_SERVICES, expect, mockServices, test } from "./fixtures.ts";

/**
 * Prestations lues dans la table Supabase `services`, réponses SIMULÉES (e2e/fixtures.ts) :
 * succès, panne, liste vide. Joué sur Android, iPhone et desktop.
 */

const ERREUR = "Impossible de charger les prestations pour le moment";
const VIDE = "Aucune prestation disponible pour l'instant.";

/**
 * En panne réseau, supabase-js réessaie seul les lectures (3 fois, après 1 s, 2 s puis 4 s)
 * avant d'abandonner : le message d'erreur arrive après ~7 s, sous le plafond de 10 s de
 * getServices. On l'attend donc plus longtemps que les 5 s par défaut.
 */
const APRES_LES_REESSAIS = { timeout: 15_000 };

test("/reserver affiche les prestations lues dans Supabase, avec leur prix", async ({ page }) => {
  await mockServices(page, {
    body: E2E_SERVICES,
  });
  const requete = page.waitForRequest(
    (r) => r.method() === "GET" && /\/rest\/v1\/services\?/.test(r.url()),
  );
  await page.goto("/reserver");

  await expect(page.getByRole("radio", { name: /^Coupe\s*60 min · 10 €/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Coupe \+ barbe\s*70 min · 12 €/ })).toBeVisible();
  // Seule mention pratique de /reserver : le lieu, plus aucune mention de paiement (consigne 27).
  await expect(
    page.getByText("Lieu exact communiqué par DM sur Instagram, sur demande."),
  ).toBeVisible();
  await expect(page.getByText(/[Pp]aiement/)).toHaveCount(0);

  // Lecture minimale : prestations actives, colonnes utiles seulement, triées.
  const url = new URL((await requete).url());
  expect(url.searchParams.get("select")).toBe("id,name,duration_min,price_label");
  // Pas de filtre sur `active` : anon n'a pas le droit de lire cette colonne (la base
  // répondrait « permission denied »), et la RLS ne lui montre déjà que les actives.
  expect(url.searchParams.has("active")).toBe(false);
  expect(url.searchParams.get("order")).toBe("sort_order.asc,name.asc");
});

test("/reserver : panne réseau, message lisible, puis « Réessayer » fonctionne", async ({
  page,
}) => {
  await mockServices(page, "network-error");
  await page.goto("/reserver");

  await expect(page.getByRole("alert")).toContainText(ERREUR, APRES_LES_REESSAIS);
  // Le reste de la page tient debout.
  await expect(page.getByRole("heading", { level: 2, name: "Quelle prestation ?" })).toBeVisible();

  // Le réseau revient : la route ajoutée en dernier passe devant.
  await mockServices(page, { body: E2E_SERVICES });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("radio", { name: /^Coupe\s*60 min/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("/reserver : erreur de la base (500), message lisible", async ({ page }) => {
  await mockServices(page, { status: 500, body: { message: "erreur interne" } });
  await page.goto("/reserver");
  await expect(page.getByRole("alert")).toContainText(ERREUR);
});

test("/reserver : aucune prestation active, message dédié et pas de formulaire", async ({
  page,
}) => {
  await mockServices(page, { body: [] });
  await page.goto("/reserver");

  await expect(page.getByText(VIDE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuer" })).toHaveCount(0);
});

test("accueil : liste vide et panne n'empêchent pas d'afficher les autres sections", async ({
  page,
}) => {
  await mockServices(page, { body: [] });
  await page.goto("/");
  const prestations = page.locator("#prestations");
  await expect(prestations.getByText(VIDE)).toBeVisible();

  await mockServices(page, "network-error");
  await page.reload();
  await expect(prestations.getByRole("alert")).toContainText(ERREUR, APRES_LES_REESSAIS);
  await expect(page.getByRole("heading", { level: 2, name: "Galerie" })).toBeVisible();
});
