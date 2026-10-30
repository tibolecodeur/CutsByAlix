import { defineConfig, devices } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  // En CI on interdit `test.only` oublié et on autorise au plus 2 reprises sur échec réseau.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Mobile d'abord (CLAUDE.md) : Android et iPhone, puis une vérification desktop.
  // Chaque test de `e2e/` tourne sur les trois projets.
  projects: [
    {
      name: "mobile-android",
      // Chromium, le moteur de Chrome Android. 375 px de large : la cible explicite de
      // CLAUDE.md, et le plus petit écran courant.
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "mobile-iphone",
      // WebKit, le moteur de Safari : profil iPhone récent (user agent Safari, tactile,
      // écran ×3), ramené à 375 px comme le projet Android. Simule Safari, ne remplace pas
      // un vrai iPhone (voir docs/TESTS-APPAREILS.md).
      use: { ...devices["iPhone 17"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Playwright lance lui-même le serveur Vite, et le réutilise s'il tourne déjà en local.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Valeurs FACTICES (le domaine .invalid n'existe jamais) : elles priment sur .env.local,
    // Vite ne remplace pas une variable déjà définie. Les appels sont simulés par
    // e2e/fixtures.ts ; sans elles, la CI (aucune variable) ne verrait que l'écran d'erreur.
    env: {
      VITE_SUPABASE_URL: "https://supabase-e2e.invalid",
      VITE_SUPABASE_ANON_KEY: "cle-anon-factice-e2e",
      // Clé publique VAPID d'exemple (format valide) : la carte « Notifications » s'affiche.
      VITE_VAPID_PUBLIC_KEY:
        "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
    },
  },
});
