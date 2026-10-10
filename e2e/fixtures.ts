import { test as base, expect, type Page, type Route } from "@playwright/test";

/**
 * Tous les tests e2e importent `test` et `expect` d'ICI (et non de @playwright/test) : chaque
 * page reçoit automatiquement une fausse API Supabase. Aucun test ne touche la vraie base.
 *
 * - Le serveur lancé par Playwright reçoit une URL factice (playwright.config.ts).
 * - Les requêtes sont reconnues par leur CHEMIN (/rest/v1/…), quel que soit l'hôte : même un
 *   serveur de dev déjà lancé avec .env.local (réutilisé en local) reste intercepté.
 * - Filet de sécurité : tout appel Supabase non simulé est coupé net, au niveau du CONTEXTE du
 *   navigateur : il couvre aussi les onglets ouverts par un test (`context.newPage()`). Les
 *   simulations posées par `page.route` passent devant lui (Playwright essaie d'abord les routes
 *   de la page, puis celles du contexte).
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
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

// ---------------------------------------------------------------------------------------
// Authentification admin simulée (Supabase Auth + table admins). Identifiants FICTIFS.
// ---------------------------------------------------------------------------------------

/** Date FIXE des tests admin (via `page.clock`) : l'expiration des jetons n'en dépend pas du jour. */
export const ADMIN_TEST_NOW = new Date("2030-01-15T09:00:00Z");

/** Compte admin fictif (jamais un vrai e-mail ni un vrai uuid). */
export const FAKE_ADMIN = {
  id: "00000000-0000-4000-8000-0000000000ad",
  email: "admin@example.test",
  password: "mot de passe factice",
};

export type AdminAuthCalls = {
  /** Mots de passe reçus par /token?grant_type=password, dans l'ordre. */
  passwordLogins: string[];
  /** Portée de chaque déconnexion (/logout?scope=…). */
  logouts: string[];
  /** Nouveaux mots de passe reçus par PUT /user. */
  passwordUpdates: string[];
  /** Nombre de lectures de la table admins. */
  adminChecks: number;
  /** Jeton d'accès délivré (pour vérifier qu'il ne fuit nulle part). */
  accessToken: string;
};

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Faux serveur d'authentification. `isAdmin: false` simule un compte valide mais absent de
 * `admins`. Le mot de passe accepté change après un PUT /user réussi.
 */
export async function mockAdminAuth(
  page: Page,
  { isAdmin = true }: { isAdmin?: boolean } = {},
): Promise<AdminAuthCalls> {
  const nowSeconds = Math.floor(ADMIN_TEST_NOW.getTime() / 1000);
  // Jeton au format JWT, signature factice : supabase-js ne le vérifie pas, le serveur simulé non plus.
  const accessToken = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      sub: FAKE_ADMIN.id,
      role: "authenticated",
      aud: "authenticated",
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
    "signature-factice",
  ].join(".");
  const user = {
    id: FAKE_ADMIN.id,
    aud: "authenticated",
    role: "authenticated",
    email: FAKE_ADMIN.email,
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2030-01-01T00:00:00Z",
  };
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: nowSeconds + 3600,
    refresh_token: "jeton-de-rafraichissement-factice",
    user,
  };
  const calls: AdminAuthCalls = {
    passwordLogins: [],
    logouts: [],
    passwordUpdates: [],
    adminChecks: 0,
    accessToken,
  };
  let currentPassword = FAKE_ADMIN.password;

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({
      status,
      headers: corsHeaders(route),
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const preflight = (route: Route) => route.fulfill({ status: 204, headers: corsHeaders(route) });

  await page.route(/\/auth\/v1\/token(\?|$)/, async (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    const grant = new URL(route.request().url()).searchParams.get("grant_type");
    if (grant === "refresh_token") return json(route, 200, session);
    const body = route.request().postDataJSON() as { email: string; password: string };
    calls.passwordLogins.push(body.password);
    if (body.email !== FAKE_ADMIN.email || body.password !== currentPassword) {
      // Réponse réelle de Supabase : la même pour un e-mail inconnu et un mauvais mot de passe.
      return json(route, 400, {
        code: 400,
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      });
    }
    return json(route, 200, session);
  });

  await page.route(/\/auth\/v1\/logout(\?|$)/, async (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    calls.logouts.push(new URL(route.request().url()).searchParams.get("scope") ?? "global");
    return route.fulfill({ status: 204, headers: corsHeaders(route) });
  });

  await page.route(/\/auth\/v1\/user(\?|$)/, async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return preflight(route);
    if (method === "PUT") {
      const { password } = route.request().postDataJSON() as { password: string };
      if (password === currentPassword) {
        return json(route, 422, { code: 422, error_code: "same_password", msg: "Same password" });
      }
      calls.passwordUpdates.push(password);
      currentPassword = password;
    }
    return json(route, 200, user);
  });

  await page.route(/\/rest\/v1\/admins(\?|$)/, async (route) => {
    if (route.request().method() === "OPTIONS") return preflight(route);
    calls.adminChecks += 1;
    return json(route, 200, isAdmin ? [{ user_id: FAKE_ADMIN.id }] : []);
  });

  return calls;
}

export const test = base.extend<{ supabaseMock: void }>({
  supabaseMock: [
    async ({ context, page }, use) => {
      await context.route(SUPABASE_API, (route) => route.abort("blockedbyclient"));
      await mockServices(page, { body: E2E_SERVICES });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
