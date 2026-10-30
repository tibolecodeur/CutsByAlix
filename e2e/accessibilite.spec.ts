import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  addDaysToKey,
  formatDayKey,
  isoWeekday,
  parisDateTime,
  parisDayKey,
} from "../src/lib/dates.ts";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  mockServices,
  mockStorage,
  mockTable,
  test,
} from "./fixtures.ts";

/**
 * Audit automatique axe (Deque) sur chaque route : règles WCAG 2.x niveaux A et AA.
 * Il attrape les erreurs mécaniques (label manquant, titres sautés, lien sans nom, lang…),
 * pas tout : la navigation au clavier et la lecture d'écran restent à vérifier à la main.
 */
const ROUTES = [
  "/",
  "/reserver",
  "/annuler",
  "/admin",
  "/conditions",
  "/mentions-legales",
  "/politique-confidentialite",
  "/une-url-qui-nexiste-pas",
];

/** Audit axe de la page dans son état courant ; affiche la règle et les éléments fautifs. */
async function expectNoViolation(page: Page) {
  const resultats = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  // On affiche l'identifiant de la règle et les éléments fautifs : lisible dans le rapport CI.
  const violations = resultats.violations.map((v) => ({
    regle: v.id,
    elements: v.nodes.map((n) => n.target.join(" ")),
  }));
  expect(violations).toEqual([]);
}

for (const route of ROUTES) {
  test(`axe : aucune violation WCAG A/AA sur ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoViolation(page);
  });
}

// ---------------------------------------------------------------------------------------
// Audit (consigne 23, docs/AUDIT-2026-10.md §E) : les ÉTATS des pages, pas seulement leur
// premier affichage : chaque étape de /reserver, la confirmation, les états de /annuler, les
// écrans d'erreur et toutes les pages admin connectées. Supabase simulé.
// ---------------------------------------------------------------------------------------

const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";

function dayWithSlots() {
  let day = parisDayKey(new Date(Date.now() + 48 * 3_600_000));
  while (isoWeekday(day) === 1) day = addDaysToKey(day, 1);
  return day;
}
function slotRow() {
  const day = dayWithSlots();
  return {
    starts_at: parisDateTime(day, "14:00").toISOString(),
    ends_at: parisDateTime(day, "15:00").toISOString(),
    location_id: "a11ce000-0000-4000-8000-000000000101",
    location_label: "Les Ponts-de-Cé",
  };
}

test("axe : chaque étape de /reserver jusqu'à la confirmation", async ({ page }) => {
  await mockRpc(page, "get_available_days", () => ({
    body: [{ day: dayWithSlots(), slot_count: 1 }],
  }));
  await mockRpc(page, "get_available_slots", () => ({ body: [slotRow()] }));
  await mockRpc(page, "create_booking", () => ({
    body: [{ ...slotRow(), service_name: "Coupe", cancel_token: TOKEN }],
  }));
  await page.goto("/reserver");
  await page
    .getByRole("radio", { name: /^Coupe/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Continuer" }).click();
  const day = page.getByRole("radio", { name: formatDayKey(dayWithSlots()) });
  await day.locator("xpath=ancestor::label[1]").click();
  await expect(
    page.getByRole("group", { name: /^Créneaux libres/ }).getByRole("radio"),
  ).toHaveCount(1);
  await expectNoViolation(page);

  await page
    .getByRole("group", { name: /^Créneaux libres/ })
    .getByRole("radio")
    .first()
    .check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Tes coordonnées" })).toBeVisible();
  // Avec les erreurs de validation affichées.
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByText("Indique ton prénom.")).toBeVisible();
  await expectNoViolation(page);

  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Durand");
  await page.getByLabel("Email").fill("zoe@example.test");
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Vérifie et confirme" })).toBeVisible();
  await expectNoViolation(page);

  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
  await expectNoViolation(page);
});

test("axe : galerie, puis photo ouverte en grand", async ({ page }) => {
  await mockTable(page, "gallery_items", [
    { id: "1", image_path: "a.webp", alt_text: "Dégradé court", width: 1200, height: 900 },
    { id: "2", image_path: "b.webp", alt_text: "Barbe taillée", width: 900, height: 1200 },
  ]);
  await mockStorage(page);
  await page.goto("/");
  const galerie = page.getByRole("region", { name: "Galerie" });
  await galerie.getByRole("button", { name: "Agrandir la photo 1 sur 2" }).click();
  const vue = page.getByRole("dialog", { name: "Galerie, photo agrandie" });
  await expect(vue.getByRole("img", { name: "Dégradé court" })).toBeVisible();
  // Fin du zoom et du fondu d'ouverture : pendant l'animation, la transparence fausse la mesure
  // des contrastes (axe lit des couleurs à moitié transparentes).
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  await expectNoViolation(page);
});

test("axe : écran d'erreur (prestations indisponibles)", async ({ page }) => {
  await mockServices(page, "network-error");
  await page.goto("/reserver");
  // supabase-js retente lui-même les lectures après une coupure : le message arrive après
  // plusieurs secondes (mesuré dans docs/AUDIT-2026-10.md).
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 25_000 });
  await expectNoViolation(page);
});

test("axe : /annuler, rendez-vous trouvé, confirmation demandée, puis annulé", async ({ page }) => {
  await mockRpc(page, "get_booking", () => ({
    body: [
      {
        status: "confirmed",
        starts_at: "2030-03-12T13:00:00+00:00",
        ends_at: "2030-03-12T14:00:00+00:00",
        service_name: "Coupe",
        location_label: "Les Ponts-de-Cé",
        first_name: "Lucas",
        can_cancel: true,
        cancelled_by: null,
      },
    ],
  }));
  await mockRpc(page, "cancel_booking", () => ({ body: true }));
  await page.goto(`/annuler#${TOKEN}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" }),
  ).toBeVisible();
  await expectNoViolation(page);
  await page.getByRole("button", { name: "Annuler mon rendez-vous" }).click();
  await expectNoViolation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeVisible();
  await expectNoViolation(page);
});

test("axe : toutes les pages admin, connecté", async ({ page }) => {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockStorage(page);
  await mockTable(page, "locations", [
    { id: "a11ce000-0000-4000-8000-000000000101", public_label: "Les Ponts-de-Cé" },
  ]);
  await mockRpc(page, "admin_booking_rules", () => ({
    body: [{ slot_step_min: 70, min_notice_min: 120, max_advance_days: 28 }],
  }));
  await mockRpc(page, "admin_list_availabilities", () => ({ body: [] }));
  await mockRpc(page, "admin_list_bookings", () => ({ body: [] }));
  await mockRpc(page, "admin_list_gallery_items", () => ({ body: [] }));
  await mockRpc(page, "admin_gallery_orphans", () => ({ body: [] }));

  await page.goto("/admin/connexion");
  await expectNoViolation(page);
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();

  for (const [path, heading] of [
    ["/admin", "Tableau de bord"],
    ["/admin/rendez-vous", "Rendez-vous"],
    ["/admin/disponibilites", "Disponibilités"],
    ["/admin/galerie", "Galerie"],
    ["/admin/compte", "Mon compte"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText(/Chargement/)).toHaveCount(0);
    await expectNoViolation(page);
  }
});
