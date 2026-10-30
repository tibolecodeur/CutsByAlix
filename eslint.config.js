import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

// « Flat config » d'ESLint : un simple tableau d'objets, appliqués de haut en bas.
// Chaque objet peut restreindre sa portée avec `files`. L'ordre compte : le dernier gagne.
export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      // Scripts tiers du skill Impeccable, installés en local et ignorés par git (.gitignore).
      ".agents/skills/impeccable",
      ".claude/skills/impeccable",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // Règles des hooks (dépendances d'effets, appels conditionnels interdits…).
      ...reactHooks.configs["recommended-latest"].rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // Les fichiers de config, les tests e2e et les hooks Claude tournent dans Node.
  {
    files: ["*.config.{js,ts}", "e2e/**/*.ts", ".claude/hooks/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  // Service worker de l'admin (notifications push) : script classique, globales du worker.
  {
    files: ["public/admin-sw.js"],
    languageOptions: { globals: globals.serviceworker, sourceType: "script" },
  },
  // Toujours en dernier : désactive les règles de style qui entreraient en conflit avec Prettier.
  eslintConfigPrettier,
);
