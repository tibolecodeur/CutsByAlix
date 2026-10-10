import { test as base, expect, type Page, type Route } from "@playwright/test";

/**
 * Tous les tests e2e importent `test` et `expect` d'ICI (et non de @playwright/test) : chaque
 * page reçoit automatiquement une fausse API Supabase. Aucun test ne touche la vraie base.
 *
 * - Le serveur lancé par Playwright reçoit une URL factice (playwright.config.ts).
 * - Les requêtes sont reconnues par leur CHEMIN (/rest/v1/…), quel que soit l'hôte : même un
 *   serveur de dev déjà lancé avec .env.local (réutilisé en local) reste intercepté.
 * - Filet de sécurité : tout appel Supabase non simulé est coupé net.
 */

/** Prestations renvoyées par défaut, au format de la table `services` (colonnes sélectionnées). */
export const E2E_SERVICES = [
  {
    id: "e2e00000-0000-4000-8000-000000000001",
    name: "Coupe",
    duration_min: 60,
    price_label: null,
  },
  {
    id: "e2e00000-0000-4000-8000-000000000002",
    name: "Coupe + barbe",
    duration_min: 60,
    price_label: null,
  },
];

const SUPABASE_API = /\/(rest|auth|storage|functions|realtime)\/v1\//;
const SERVICES_ENDPOINT = /\/rest\/v1\/services(\?|$)/;

/**
 * Le site (localhost) et Supabase n'ont pas la même origine : le navigateur exige les
 * en-têtes CORS, et envoie d'abord une requête OPTIONS (« preflight ») à cause des en-têtes
 * `apikey` et `Authorization`.
 */
function corsHeaders(route: Route): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers":
      route.request().headers()["access-control-request-headers"] ?? "*",
  };
}

export type ServicesResponse =
  | { status?: number; body: unknown }
  /** Panne réseau (4G coupée, DNS…) : la requête n'aboutit pas. */
  | "network-error";

/**
 * Remplace la réponse de la table `services`. Appelée dans un test APRÈS le fixture, elle
 * passe devant lui : Playwright essaie les routes de la plus récente à la plus ancienne.
 */
export async function mockServices(page: Page, response: ServicesResponse): Promise<void> {
  await page.route(SERVICES_ENDPOINT, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
    } else if (response === "network-error") {
      await route.abort("internetdisconnected");
    } else {
      await route.fulfill({
        status: response.status ?? 200,
        headers: corsHeaders(route),
        contentType: "application/json",
        body: JSON.stringify(response.body),
      });
    }
  });
}

/** Réponse simulée d'une RPC : corps JSON (et statut), ou panne réseau. */
export type RpcResponse = { status?: number; body: unknown } | "network-error";

/** Erreur métier telle que PostgREST la renvoie pour une exception P0001 (`raise exception`). */
export function rpcError(code: string): RpcResponse {
  return { status: 400, body: { code: "P0001", message: code, details: null, hint: null } };
}

/**
 * Remplace une RPC (`POST /rest/v1/rpc/<nom>`). `respond` reçoit les paramètres envoyés par
 * le site (corps JSON) : un test peut répondre selon le jour demandé, ou vérifier ce qui part.
 */
export async function mockRpc(
  page: Page,
  name: string,
  respond: (args: Record<string, unknown>) => RpcResponse,
): Promise<void> {
  await page.route(new RegExp(`/rest/v1/rpc/${name}(\\?|$)`), async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(route) });
      return;
    }
    const response = respond((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    if (response === "network-error") {
      await route.abort("internetdisconnected");
    } else {
      await route.fulfill({
        status: response.status ?? 200,
        headers: corsHeaders(route),
        contentType: "application/json",
        body: JSON.stringify(response.body),
      });
    }
  });
}

export const test = base.extend<{ supabaseMock: void }>({
  supabaseMock: [
    async ({ page }, use) => {
      await page.route(SUPABASE_API, (route) => route.abort("blockedbyclient"));
      await mockServices(page, { body: E2E_SERVICES });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
