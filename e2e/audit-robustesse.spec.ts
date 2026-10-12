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
  E2E_SERVICES,
  expect,
  FAILURE_MODES,
  FAKE_ADMIN,
  mockAdminAuth,
  mockFaulty,
  mockRpc,
  mockStorage,
  mockTable,
  TECHNICAL_TEXT,
  test,
  type Fault,
} from "./fixtures.ts";

/**
 * Audit (consigne 23, docs/AUDIT-2026-10.md §C) : chaque écran face à chaque panne de Supabase.
 * Pour chaque couple (écran, panne) :
 *   1. le site affiche un message clair (zone role="alert"), en français ;
 *   2. aucun détail technique n'apparaît (TECHNICAL_TEXT : SQL, PostgREST, JS…) alors que la
 *      fausse API en renvoie exprès (« relation "public.bookings" does not exist », « JWT expired ») ;
 *   3. une fois la panne levée, un seul appui (« Réessayer » ou le bouton d'envoi) suffit.
 * Supabase est SIMULÉ (e2e/fixtures.ts) : aucune vraie base n'est touchée.
 */

const HOUR_MS = 3_600_000;
const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";
const LOCATION = "a11ce000-0000-4000-8000-000000000101";

/** Premier jour (à Paris) 48 h plus tard, hors lundi. */
function dayWithSlots() {
  let day = parisDayKey(new Date(Date.now() + 48 * HOUR_MS));
  while (isoWeekday(day) === 1) day = addDaysToKey(day, 1);
  return day;
}
function slotRow() {
  const day = dayWithSlots();
  return {
    starts_at: parisDateTime(day, "14:00").toISOString(),
    ends_at: parisDateTime(day, "15:00").toISOString(),
    location_id: LOCATION,
    location_label: "Angers",
  };
}
const BOOKING_ROW = {
  status: "confirmed",
  starts_at: "2030-03-12T13:00:00+00:00",
  ends_at: "2030-03-12T14:00:00+00:00",
  service_name: "Coupe",
  location_label: "Angers",
  first_name: "Lucas",
  can_cancel: true,
  cancelled_by: null,
};

/** Vérifie l'écran d'erreur : message, aucun texte technique, nulle part dans la page. */
async function expectCleanError(page: Page, fault: Fault) {
  // Panne « timeout » : la fausse API ne répond qu'au bout de 15 s ; sous la charge de la suite
  // complète (6 navigateurs, un seul serveur Vite), 25 s ne suffisaient pas toujours (passe 3
  // de l'audit). On laisse de la marge sans changer ce qui est vérifié.
  const wait = fault.mode === "timeout" ? 50_000 : 25_000;
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: wait });
  const text = await page.locator("body").innerText();
  expect(text, `texte technique affiché (panne ${fault.mode})`).not.toMatch(TECHNICAL_TEXT);
  expect(await page.title()).not.toMatch(TECHNICAL_TEXT);
}

async function loginAdmin(page: Page, path: string, heading: string) {
  await page.goto(path);
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

type Screen = {
  name: string;
  /** Prépare les simulations (la route en panne passe par `mockFaulty`) et ouvre l'écran. */
  open: (page: Page, fault: Fault) => Promise<void>;
  /** Déclenche l'appel qui échoue, si l'écran ne le fait pas tout seul au chargement. */
  trigger?: (page: Page) => Promise<void>;
  /** Nouvel essai par l'utilisateur, une fois la panne levée. */
  retry: (page: Page) => Promise<void>;
  /** Preuve que le nouvel essai a réussi. */
  expectRecovered: (page: Page) => Promise<void>;
};

const retryButton = (page: Page) => page.getByRole("button", { name: "Réessayer" }).click();

const SCREENS: Screen[] = [
  {
    name: "accueil (prestations)",
    open: async (page, fault) => {
      await mockFaulty(page, /\/rest\/v1\/services(\?|$)/, () => E2E_SERVICES, fault);
      await page.goto("/");
    },
    retry: retryButton,
    expectRecovered: (page) => expect(page.getByText("Coupe + barbe").first()).toBeVisible(),
  },
  {
    name: "réserver : prestations",
    open: async (page, fault) => {
      await mockFaulty(page, /\/rest\/v1\/services(\?|$)/, () => E2E_SERVICES, fault);
      await page.goto("/reserver");
    },
    retry: retryButton,
    expectRecovered: (page) =>
      expect(page.getByRole("radio", { name: /^Coupe \+ barbe/ })).toBeVisible(),
  },
  {
    name: "réserver : créneaux",
    open: async (page, fault) => {
      await mockFaulty(
        page,
        /\/rest\/v1\/rpc\/get_available_slots(\?|$)/,
        () => [slotRow()],
        fault,
      );
      await page.goto("/reserver");
      await page
        .getByRole("radio", { name: /^Coupe/ })
        .first()
        .check();
      await page.getByRole("button", { name: "Continuer" }).click();
      const day = page.getByRole("radio", { name: formatDayKey(dayWithSlots()) });
      await day.locator("xpath=ancestor::label[1]").click();
    },
    retry: retryButton,
    expectRecovered: (page) =>
      expect(page.getByRole("group", { name: /^Créneaux libres/ }).getByRole("radio")).toHaveCount(
        1,
      ),
  },
  {
    name: "réserver : envoi de la réservation",
    open: async (page, fault) => {
      await mockRpc(page, "get_available_slots", () => ({ body: [slotRow()] }));
      await mockFaulty(
        page,
        /\/rest\/v1\/rpc\/create_booking(\?|$)/,
        () => [{ ...slotRow(), service_name: "Coupe", cancel_token: TOKEN }],
        fault,
      );
      await page.goto("/reserver");
      await page
        .getByRole("radio", { name: /^Coupe/ })
        .first()
        .check();
      await page.getByRole("button", { name: "Continuer" }).click();
      const day = page.getByRole("radio", { name: formatDayKey(dayWithSlots()) });
      await day.locator("xpath=ancestor::label[1]").click();
      await page
        .getByRole("group", { name: /^Créneaux libres/ })
        .getByRole("radio")
        .first()
        .check();
      await page.getByRole("button", { name: "Continuer" }).click();
      await page.getByLabel("Prénom").fill("Zoé");
      await page.getByLabel("Nom", { exact: true }).fill("Durand");
      await page.getByLabel("Email").fill("zoe@example.test");
      await page.getByRole("checkbox", { name: /J'accepte/ }).check();
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(
        page.getByRole("heading", { level: 2, name: "Vérifie et confirme" }),
      ).toBeVisible();
    },
    trigger: (page) => page.getByRole("button", { name: "Confirmer la réservation" }).click(),
    retry: (page) => page.getByRole("button", { name: "Confirmer la réservation" }).click(),
    expectRecovered: (page) =>
      expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible(),
  },
  {
    name: "annulation : chargement",
    open: async (page, fault) => {
      await mockFaulty(page, /\/rest\/v1\/rpc\/get_booking(\?|$)/, () => [BOOKING_ROW], fault);
      await page.goto(`/annuler#${TOKEN}`);
    },
    retry: retryButton,
    expectRecovered: (page) =>
      expect(page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" })).toBeVisible(),
  },
  {
    name: "annulation : envoi",
    open: async (page, fault) => {
      await mockRpc(page, "get_booking", () => ({ body: [BOOKING_ROW] }));
      await mockFaulty(page, /\/rest\/v1\/rpc\/cancel_booking(\?|$)/, () => true, fault);
      await page.goto(`/annuler#${TOKEN}`);
      await page.getByRole("button", { name: "Annuler mon rendez-vous" }).click();
    },
    trigger: (page) => page.getByRole("button", { name: "Oui, annuler" }).click(),
    retry: (page) => page.getByRole("button", { name: "Oui, annuler" }).click(),
    expectRecovered: (page) =>
      expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeVisible(),
  },
  {
    name: "admin : disponibilités",
    open: async (page, fault) => {
      await page.clock.install({ time: ADMIN_TEST_NOW });
      await mockAdminAuth(page);
      await mockTable(page, "locations", [{ id: LOCATION, public_label: "Angers" }]);
      await mockRpc(page, "admin_booking_rules", () => ({
        body: [{ slot_step_min: 70, min_notice_min: 300, max_advance_days: 28 }],
      }));
      await mockFaulty(page, /\/rest\/v1\/rpc\/admin_list_availabilities(\?|$)/, () => [], fault);
      await loginAdmin(page, "/admin/disponibilites", "Disponibilités");
    },
    retry: retryButton,
    expectRecovered: (page) => expect(page.getByRole("alert")).toHaveCount(0),
  },
  {
    name: "admin : rendez-vous",
    open: async (page, fault) => {
      await page.clock.install({ time: ADMIN_TEST_NOW });
      await mockAdminAuth(page);
      await mockFaulty(page, /\/rest\/v1\/rpc\/admin_list_bookings(\?|$)/, () => [], fault);
      await loginAdmin(page, "/admin/rendez-vous", "Rendez-vous");
    },
    retry: retryButton,
    expectRecovered: (page) => expect(page.getByRole("alert")).toHaveCount(0),
  },
  {
    name: "admin : galerie",
    open: async (page, fault) => {
      await page.clock.install({ time: ADMIN_TEST_NOW });
      await mockAdminAuth(page);
      await mockStorage(page);
      await mockRpc(page, "admin_gallery_orphans", () => ({ body: [] }));
      await mockFaulty(page, /\/rest\/v1\/rpc\/admin_list_gallery_items(\?|$)/, () => [], fault);
      await loginAdmin(page, "/admin/galerie", "Galerie");
    },
    retry: retryButton,
    expectRecovered: (page) => expect(page.getByRole("alert")).toHaveCount(0),
  },
];

/**
 * Cas où le comportement observé est un DÉFAUT relevé par l'audit : le test est conservé mais
 * sauté, avec la référence du constat (jamais supprimé). Clé : « écran|panne ».
 */
const KNOWN_DEFECTS: Record<string, string> = {
  "annulation : chargement|wrong-shape":
    "Constat C-02 (docs/AUDIT-2026-10.md) : réponse de forme inattendue affichée comme « Lien invalide »",
  "annulation : envoi|empty":
    "Constat C-02 (docs/AUDIT-2026-10.md) : réponse vide affichée comme « C'est annulé »",
  "annulation : envoi|wrong-shape":
    "Constat C-02 (docs/AUDIT-2026-10.md) : réponse de forme inattendue affichée comme « C'est annulé »",
};

for (const screen of SCREENS) {
  test.describe(`robustesse : ${screen.name}`, () => {
    for (const mode of FAILURE_MODES) {
      test(`${mode} : message clair, rien de technique, nouvel essai possible`, async ({
        page,
      }) => {
        const defect = KNOWN_DEFECTS[`${screen.name}|${mode}`];
        test.skip(!!defect, defect);
        test.setTimeout(mode === "timeout" ? 90_000 : 30_000);

        const fault: Fault = { mode: screen.trigger ? null : mode, hits: 0 };
        await screen.open(page, fault);
        if (screen.trigger) {
          fault.mode = mode;
          await screen.trigger(page);
        }
        await expectCleanError(page, fault);

        fault.mode = null;
        await screen.retry(page);
        await screen.expectRecovered(page);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------
// Actions : double appui, rechargement, bouton Retour, coupure pendant l'envoi.
// ---------------------------------------------------------------------------------------

/** Parcours /reserver jusqu'au récapitulatif ; renvoie les appels à create_booking. */
async function openSummary(
  page: Page,
  respond: (call: number) => "ok" | "network-error" | "taken",
) {
  const calls: Record<string, unknown>[] = [];
  await mockRpc(page, "get_available_slots", () => ({ body: [slotRow()] }));
  await mockRpc(page, "create_booking", (args) => {
    calls.push(args);
    const outcome = respond(calls.length);
    if (outcome === "network-error") return "network-error";
    if (outcome === "taken") {
      return {
        status: 400,
        body: { code: "P0001", message: "slot_unavailable", details: null, hint: null },
      };
    }
    return { body: [{ ...slotRow(), service_name: "Coupe", cancel_token: TOKEN }] };
  });
  await page.goto("/");
  await page.goto("/reserver");
  await page
    .getByRole("radio", { name: /^Coupe/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Continuer" }).click();
  const day = page.getByRole("radio", { name: formatDayKey(dayWithSlots()) });
  await day.locator("xpath=ancestor::label[1]").click();
  await page
    .getByRole("group", { name: /^Créneaux libres/ })
    .getByRole("radio")
    .first()
    .check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Durand");
  await page.getByLabel("Email").fill("zoe@example.test");
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Vérifie et confirme" })).toBeVisible();
  return calls;
}

test.describe("robustesse : actions", () => {
  test("double appui sur « Confirmer la réservation » : une seule réservation envoyée", async ({
    page,
  }) => {
    const calls = await openSummary(page, () => "ok");
    await page.getByRole("button", { name: "Confirmer la réservation" }).dblclick();
    await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
    expect(calls).toHaveLength(1);
  });

  test("double appui sur « Ajouter la disponibilité » : une seule plage envoyée", async ({
    page,
  }) => {
    const created: unknown[] = [];
    await page.clock.install({ time: ADMIN_TEST_NOW });
    await mockAdminAuth(page);
    await mockTable(page, "locations", [{ id: LOCATION, public_label: "Angers" }]);
    await mockRpc(page, "admin_booking_rules", () => ({
      body: [{ slot_step_min: 70, min_notice_min: 300, max_advance_days: 28 }],
    }));
    await mockRpc(page, "admin_list_availabilities", () => ({ body: [] }));
    await mockRpc(page, "admin_create_availability", (args) => {
      created.push(args);
      return { body: "e2e00000-0000-4000-8000-0000000000a9" };
    });
    await loginAdmin(page, "/admin/disponibilites", "Disponibilités");
    await page.getByLabel("Jour").fill("2030-01-20");
    await page.getByLabel("Début").fill("10:00");
    await page.getByLabel("Fin").fill("13:30");
    await page.getByRole("button", { name: "Ajouter la disponibilité" }).dblclick();
    await expect.poll(() => created.length).toBe(1);
    await page.waitForTimeout(500);
    expect(created).toHaveLength(1);
  });

  test("rechargement en plein formulaire : on repart proprement de l'étape 1", async ({ page }) => {
    await openSummary(page, () => "ok");
    await page.reload();
    await expect(page.getByText("Étape 1 sur 4")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("rechargement de la confirmation : le lien d'annulation reste affiché", async ({ page }) => {
    test.skip(
      true,
      "Constat C-03 (docs/AUDIT-2026-10.md) : après un rechargement, la confirmation et le lien d'annulation sont perdus",
    );
    await openSummary(page, () => "ok");
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
  });

  test("bouton Retour du navigateur pendant la réservation : revient à l'étape précédente", async ({
    page,
  }) => {
    test.skip(
      true,
      "Constat C-04 (docs/AUDIT-2026-10.md) : le Retour du navigateur (geste Android/iOS) quitte /reserver et perd la saisie",
    );
    await openSummary(page, () => "ok");
    await page.goBack();
    await expect(page).toHaveURL(/\/reserver$/);
    await expect(page.getByRole("heading", { level: 2, name: "Tes coordonnées" })).toBeVisible();
  });

  test("coupure pendant l'envoi : message clair, puis nouvel essai en un appui", async ({
    page,
  }) => {
    const calls = await openSummary(page, (n) => (n === 1 ? "network-error" : "ok"));
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(TECHNICAL_TEXT);
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
    expect(calls).toHaveLength(2);
  });

  test("coupure APRÈS enregistrement (réponse perdue) : le client n'est pas induit en erreur", async ({
    page,
  }) => {
    test.skip(
      true,
      "Constat C-05 (docs/AUDIT-2026-10.md) : la réservation est créée mais la réponse se perd ; le nouvel essai dit « créneau plus disponible » et le client n'a jamais son lien",
    );
    // 1er appel : la base enregistre, la réponse se perd. 2e : le créneau est (par lui) pris.
    await openSummary(page, (n) => (n === 1 ? "network-error" : "taken"));
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la réservation" }).click();
    await expect(page.getByRole("alert")).not.toContainText("n'est plus disponible");
  });
});
