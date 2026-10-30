import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { ADMIN_TEST_NOW, expect, FAKE_ADMIN, mockAdminAuth, mockRpc, test } from "./fixtures.ts";

/**
 * Carte « Notifications » de « Mon compte » (ADR 0012), sur les 3 projets. Le push réel ne se
 * teste que sur un vrai téléphone (docs/TESTS-APPAREILS.md) : ici, l'autorisation, le service
 * worker et l'abonnement du navigateur sont SIMULÉS (aucun service de push contacté), et les
 * RPC passent par Supabase simulé, comme le reste de l'admin.
 */

const ENDPOINT = "https://web.push.apple.com/abonnement-e2e";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

/** Remplace Notification, le service worker et PushManager avant tout script de la page. */
async function simulerNavigateur(page: Page, { push = true } = {}) {
  await page.addInitScript(
    ({ endpoint, push }) => {
      let permission: NotificationPermission = "default";
      let current: unknown = null;
      const subscription = {
        endpoint,
        toJSON: () => ({ endpoint, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } }),
        unsubscribe: async () => {
          current = null;
          return true;
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () => current,
          subscribe: async () => {
            current = subscription;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: async () => registration,
          ready: Promise.resolve(registration),
          getRegistration: async () => registration,
        },
      });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          get permission() {
            return permission;
          },
          requestPermission: async () => {
            permission = "granted";
            return permission;
          },
        },
      });
      if (push) {
        Object.defineProperty(window, "PushManager", { configurable: true, value: function () {} });
      } else {
        // iPhone dans un onglet Safari : pas de PushManager.
        delete (window as { PushManager?: unknown }).PushManager;
      }
    },
    { endpoint: ENDPOINT, push },
  );
}

async function ouvrirMonCompte(page: Page) {
  await page.clock.install({ time: ADMIN_TEST_NOW });
  await mockAdminAuth(page);
  await page.goto("/admin/connexion");
  await page.getByLabel("E-mail").fill(FAKE_ADMIN.email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(FAKE_ADMIN.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page
    .getByRole("navigation", { name: "Navigation admin" })
    .getByRole("link", { name: "Compte" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}

test("activer, tester puis désactiver les notifications sur ce téléphone", async ({ page }) => {
  await simulerNavigateur(page);
  const enregistrements: Record<string, unknown>[] = [];
  const suppressions: Record<string, unknown>[] = [];
  await mockRpc(page, "admin_save_push_subscription", (args) => {
    enregistrements.push(args);
    return { body: null };
  });
  await mockRpc(page, "admin_delete_push_subscription", (args) => {
    suppressions.push(args);
    return { body: true };
  });
  await mockRpc(page, "admin_send_test_push", () => ({ body: "queued" }));

  await ouvrirMonCompte(page);
  const activer = page.getByRole("button", { name: "Activer les notifications" });
  await expect(page.getByRole("heading", { level: 2, name: "Notifications" })).toBeVisible();
  await expect(activer).toBeVisible();
  const box = await activer.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await activer.click();
  await expect(page.getByText("Notifications activées sur ce téléphone.")).toBeVisible();
  expect(enregistrements).toEqual([
    { p_endpoint: ENDPOINT, p_p256dh: "B".repeat(87), p_auth: "A".repeat(22) },
  ]);
  await expect(page.getByText("Activées sur ce téléphone.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Envoyer une notification de test" }).click();
  await expect(page.getByText(/elle arrive dans quelques secondes/)).toBeVisible();

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Désactiver" }).click();
  await expect(page.getByText("Notifications désactivées sur ce téléphone.")).toBeVisible();
  expect(suppressions).toEqual([{ p_endpoint: ENDPOINT }]);
  await expect(activer).toBeVisible();
});

test.describe("iPhone dans un onglet Safari", () => {
  test.use({ userAgent: IPHONE_UA });

  test("marche à suivre pour l'écran d'accueil, aucun bouton d'activation", async ({ page }) => {
    await simulerNavigateur(page, { push: false });
    await ouvrirMonCompte(page);

    await expect(page.getByText(/choisis « Sur l'écran d'accueil »/)).toBeVisible();
    await expect(page.getByText(/iOS 16.4 ou plus récent/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Activer les notifications" })).toHaveCount(0);
  });
});
