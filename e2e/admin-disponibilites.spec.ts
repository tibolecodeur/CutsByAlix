import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  ADMIN_TEST_NOW,
  expect,
  FAKE_ADMIN,
  mockAdminAuth,
  mockRpc,
  mockTable,
  rpcError,
  test,
} from "./fixtures.ts";

/**
 * Disponibilités de l'admin (Android, iPhone, desktop). Supabase SIMULÉ : auth, table
 * `locations` et RPC `admin_*` interceptées ; tout autre appel est coupé par le filet de
 * e2e/fixtures.ts. Horloge fixée : mardi 15 janvier 2030, 10 h à Paris (ADMIN_TEST_NOW).
 */

const RULES = [{ slot_step_min: 70, min_notice_min: 2880, max_advance_days: 28 }];
const PONTS_DE_CE = { id: "e2e00000-0000-4000-8000-0000000001c1", public_label: "Les Ponts-de-Cé" };

/** Jeudi 17 janvier 2030, 14 h – 18 h à Paris, avec une réservation. */
const PLAGE_AVEC_RDV = {
  id: "e2e00000-0000-4000-8000-0000000000a1",
  location_id: PONTS_DE_CE.id,
  location_label: "Les Ponts-de-Cé",
  starts_at: "2030-01-17T13:00:00+00:00",
  ends_at: "2030-01-17T17:00:00+00:00",
  slot_count: 3,
  booking_count: 1,
};

type Options = { locations?: unknown[]; availabilities?: (typeof PLAGE_AVEC_RDV)[] };

/** Prépare la fausse API, se connecte et ouvre /admin/disponibilites. */
async function ouvrirDispos(page: Page, options: Options = {}) {
  const availabilities = [...(options.availabilities ?? [PLAGE_AVEC_RDV])];
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));

  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  const locationRequests = await mockTable(page, "locations", options.locations ?? [PONTS_DE_CE]);
  await mockRpc(page, "admin_booking_rules", () => ({ body: RULES }));
  await mockRpc(page, "admin_list_availabilities", () => ({ body: availabilities }));

  await page.goto("/admin/disponibilites");
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Disponibilités" })).toBeVisible();
  return { availabilities, urls, locationRequests };
}

async function saisirPlage(page: Page, jour: string, debut: string, fin: string) {
  await page.getByLabel("Jour").fill(jour);
  await page.getByLabel("Début").fill(debut);
  await page.getByLabel("Fin").fill(fin);
}

test("création : aperçu en direct, période réservable, plage ajoutée à la liste", async ({
  page,
}) => {
  const created: Record<string, unknown>[] = [];
  const { availabilities, urls, locationRequests } = await ouvrirDispos(page);
  await mockRpc(page, "admin_create_availability", (args) => {
    created.push(args);
    const row = {
      ...PLAGE_AVEC_RDV,
      id: "e2e00000-0000-4000-8000-0000000000a2",
      starts_at: String(args.p_starts_at),
      ends_at: String(args.p_ends_at),
      booking_count: 0,
    };
    availabilities.push(row);
    return { body: [row] };
  });

  // Dimanche 20 janvier, 10 h – 13 h 30 : 3 créneaux de 70 min.
  await saisirPlage(page, "2030-01-20", "10:00", "13:30");
  const apercu = page.getByTestId("slot-preview");
  await expect(apercu).toContainText("3 créneaux : 10:00, 11:10, 12:20");
  await expect(apercu).toContainText(
    "Réservable par les clients dès maintenant jusqu'au vendredi 18 janvier à 12:20.",
  );

  // Trop court : moins d'un créneau.
  await page.getByLabel("Fin").fill("11:00");
  await expect(apercu).toContainText("La plage doit durer au moins 70 min (un créneau).");
  await page.getByLabel("Fin").fill("13:30");

  // Un seul lieu actif : déjà coché. Libellé public uniquement.
  await expect(page.getByRole("radio", { name: "Les Ponts-de-Cé" })).toBeChecked();
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Ajouter la disponibilité" }).click();
  await expect(page.getByText(/^Disponibilité ajoutée : dimanche 20 janvier/)).toBeVisible();
  // Heures de Paris converties en instants absolus (UTC+1 en janvier).
  expect(created).toEqual([
    {
      p_location_id: PONTS_DE_CE.id,
      p_starts_at: "2030-01-20T09:00:00.000Z",
      p_ends_at: "2030-01-20T12:30:00.000Z",
    },
  ]);

  const semaine = page.getByRole("region", { name: "Semaine du lundi 14 janvier" });
  await expect(semaine.getByRole("listitem")).toHaveCount(2);
  await expect(semaine.getByRole("listitem").nth(1)).toContainText(
    "10:00 – 13:30 · Les Ponts-de-Cé",
  );
  await expect(semaine.getByRole("listitem").nth(1)).toContainText("3 créneaux · 0 réservation");

  // Lieux : colonnes nommées, jamais select=* (l'admin n'a droit qu'à id, public_label, active).
  expect(locationRequests.length).toBeGreaterThan(0);
  expect(urls.filter((url) => /select=\*/.test(url))).toEqual([]);
});

test("chevauchement : refusé par la base, message en français", async ({ page }) => {
  await ouvrirDispos(page);
  await mockRpc(page, "admin_create_availability", () => rpcError("availability_overlap"));

  await saisirPlage(page, "2030-01-17", "17:00", "19:00");
  await page.getByRole("button", { name: "Ajouter la disponibilité" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Cette plage chevauche une autre disponibilité (tous lieux confondus). Modifie les horaires.",
  );
});

test("suppression refusée quand des réservations existent : la plage reste", async ({ page }) => {
  await ouvrirDispos(page);
  const suppressions: unknown[] = [];
  await mockRpc(page, "admin_delete_availability", (args) => {
    suppressions.push(args);
    return rpcError("availability_has_bookings");
  });

  const plage = page.getByRole("listitem").filter({ hasText: "jeudi 17 janvier" });
  await expect(plage).toContainText("14:00 – 18:00 · Les Ponts-de-Cé");
  await expect(plage).toContainText("3 créneaux · 1 réservation");
  await plage
    .getByRole("button", { name: /^Supprimer la disponibilité du jeudi 17 janvier/ })
    .click();
  await plage.getByRole("button", { name: "Oui, supprimer" }).click();

  await expect(plage.getByRole("alert")).toContainText(
    "Des rendez-vous sont prévus sur cette plage : annule-les d'abord, puis supprime-la.",
  );
  await expect(plage).toBeVisible();
  expect(suppressions).toEqual([{ p_id: PLAGE_AVEC_RDV.id }]);
});

test("aucun lieu actif : explication, aucun formulaire ni contournement", async ({ page }) => {
  await ouvrirDispos(page, { locations: [], availabilities: [] });

  await expect(page.getByRole("heading", { name: "Aucun lieu actif" })).toBeVisible();
  await expect(page.getByText(/Les lieux sont activés par le développeur/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter la disponibilité" })).toHaveCount(0);
  await expect(page.getByLabel("Jour")).toHaveCount(0);
  await expect(page.getByText(/Aucune disponibilité à venir/)).toBeVisible();
});
