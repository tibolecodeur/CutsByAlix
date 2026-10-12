import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  rpcError,
  test,
} from "./fixtures.ts";

/**
 * Réservations côté admin (Android, iPhone, desktop). Supabase SIMULÉ : auth et RPC
 * `admin_*_booking(s)` interceptées ; tout autre appel est coupé par le filet de
 * e2e/fixtures.ts. Horloge fixée : mardi 15 janvier 2030, 10 h à Paris (ADMIN_TEST_NOW).
 * Clients FICTIFS (téléphones de la plage 06 39 98, réservée à la fiction par l'ARCEP).
 */

const LIGNE = {
  service_name: "Coupe",
  location_label: "Les Ponts-de-Cé",
  status: "confirmed",
  cancelled_by: null,
};
/** Aujourd'hui, 14 h à Paris. */
const RDV_LEA = {
  ...LIGNE,
  id: "e2e00000-0000-4000-8000-0000000000b1",
  starts_at: "2030-01-15T13:00:00+00:00",
  ends_at: "2030-01-15T14:00:00+00:00",
  first_name: "Léa",
  last_name: "Martin",
};
/** Jeudi 17 janvier, 15 h 10, annulé par le client. */
const RDV_TOM = {
  ...LIGNE,
  id: "e2e00000-0000-4000-8000-0000000000b2",
  starts_at: "2030-01-17T14:10:00+00:00",
  ends_at: "2030-01-17T15:10:00+00:00",
  first_name: "Tom",
  last_name: "Durand",
  status: "cancelled",
  cancelled_by: "client",
};
/** Samedi 12 janvier, terminé. */
const RDV_ANA = {
  ...LIGNE,
  id: "e2e00000-0000-4000-8000-0000000000b3",
  starts_at: "2030-01-12T09:00:00+00:00",
  ends_at: "2030-01-12T10:00:00+00:00",
  first_name: "Ana",
  last_name: "Blanc",
};
const CONTACT_LEA = { phone: "0639980001", email: "lea@example.test" };
/** Ce qui ne doit apparaître ni dans une URL, ni dans le titre de la page. */
const DONNEES_CLIENT = /Léa|L%C3%A9a|Martin|0639980001|lea@example|Tom|Durand|Ana|Blanc/;

/** Prépare la fausse API, se connecte et ouvre /admin/rendez-vous. */
async function ouvrirRendezVous(page: Page) {
  const urls: string[] = [];
  const consoleMessages: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  page.on("console", (message) => consoleMessages.push(message.text()));
  let lea: Record<string, unknown> = { ...RDV_LEA, ...CONTACT_LEA };
  const cancelled: Record<string, unknown>[] = [];

  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await mockRpc(page, "admin_list_bookings", (args) => ({
    body: args.p_scope === "past" ? [RDV_ANA] : [{ ...RDV_LEA, ...pick(lea) }, RDV_TOM],
  }));
  await mockRpc(page, "admin_get_booking", (args) =>
    args.p_id === RDV_LEA.id ? { body: [lea] } : rpcError("not_found"),
  );
  await mockRpc(page, "admin_cancel_booking", (args) => {
    cancelled.push(args);
    lea = { ...lea, status: "cancelled", cancelled_by: "barber" };
    return { body: cancelled.length === 1 };
  });

  await page.goto("/admin/rendez-vous");
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rendez-vous" })).toBeVisible();
  return { urls, cancelled, consoleMessages };
}

/** État courant de Léa, sans ses coordonnées (la liste n'en contient jamais). */
function pick(row: Record<string, unknown>) {
  return { status: row.status, cancelled_by: row.cancelled_by };
}

test("liste : aujourd'hui mis en avant, compteur, aucune coordonnée, onglet « Passées »", async ({
  page,
}) => {
  const { urls } = await ouvrirRendezVous(page);

  await expect(page.getByText("1 rendez-vous confirmé à venir")).toBeVisible();
  const aujourdhui = page.getByRole("region", { name: "Aujourd'hui, mardi 15 janvier" });
  await expect(aujourdhui.getByRole("link", { name: /14:00 – 15:00\s*Léa Martin/ })).toBeVisible();
  const jeudi = page.getByRole("region", { name: "jeudi 17 janvier" });
  await expect(jeudi.getByText("Annulé par le client")).toBeVisible();
  await expect(page.locator('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]')).toHaveCount(0);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Passées" }).click();
  await expect(page.getByText("Ana Blanc")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/rendez-vous$/);
  expect(urls.filter((url) => DONNEES_CLIENT.test(url))).toEqual([]);
  await expect(page).not.toHaveTitle(DONNEES_CLIENT);
});

test("détail : Appeler / SMS, puis annulation confirmée, une seule fois malgré le double appui", async ({
  page,
}) => {
  const { urls, cancelled, consoleMessages } = await ouvrirRendezVous(page);

  await page.getByRole("link", { name: /Léa Martin/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/rendez-vous/${RDV_LEA.id}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Léa Martin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveAttribute(
    "href",
    "tel:0639980001",
  );
  await expect(page.getByRole("link", { name: "SMS" })).toHaveAttribute("href", "sms:0639980001");
  await expect(page).toHaveTitle(/Détail du rendez-vous/);
  await expect(page).not.toHaveTitle(DONNEES_CLIENT);

  await page.getByRole("button", { name: "Annuler le rendez-vous" }).click();
  await expect(
    page.getByText(
      "Annuler le rendez-vous de Léa le mardi 15 janvier à 14:00 ? Le client n'est pas prévenu : contacte-le.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Oui, annuler" }).dblclick();

  await expect(
    page.getByText(/Rendez-vous annulé, le créneau est de nouveau proposé/),
  ).toBeVisible();
  await expect(page.getByText("Annulé par toi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler le rendez-vous" })).toHaveCount(0);
  expect(cancelled).toEqual([{ p_id: RDV_LEA.id }]);
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  // Retour à la liste : le RDV y apparaît annulé, le compteur l'a retiré.
  await page.getByRole("link", { name: "← Tous les rendez-vous" }).click();
  await expect(page.getByText("Aucun rendez-vous confirmé à venir")).toBeVisible();
  await expect(page.getByText("Annulé par toi")).toBeVisible();

  // Seul l'identifiant technique passe dans les URL ; aucun appel hors du site et de Supabase.
  expect(urls.filter((url) => DONNEES_CLIENT.test(url))).toEqual([]);
  expect(consoleMessages.filter((text) => DONNEES_CLIENT.test(text))).toEqual([]);
  // Hôtes permis : le site, la fausse URL Supabase (playwright.config.ts) et, si un serveur de
  // dev est réutilisé avec .env.local, le vrai projet (intercepté quand même par le filet).
  const permis = (h: string) =>
    ["", "localhost", "127.0.0.1", "supabase-e2e.invalid"].includes(h) ||
    h.endsWith(".supabase.co");
  const hotes = new Set(urls.map((url) => new URL(url).hostname));
  expect([...hotes].filter((h) => !permis(h))).toEqual([]);
});

test("détail d'un rendez-vous inconnu : message, aucune donnée", async ({ page }) => {
  await ouvrirRendezVous(page);
  await page.goto("/admin/rendez-vous/e2e00000-0000-4000-8000-0000000000ff");
  await expect(page.getByRole("alert")).toContainText("Ce rendez-vous n'existe pas");
  await expect(page.getByRole("link", { name: "Appeler" })).toHaveCount(0);
});
