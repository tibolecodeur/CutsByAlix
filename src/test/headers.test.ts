import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `public/_headers` (Cloudflare Pages) : l'URL de /annuler contient le jeton d'annulation.
 * Le fichier doit garder, pour ce chemin, ni Referer sortant, ni indexation. Rien n'est
 * déployé : on vérifie seulement que le fichier est prêt.
 */
const headers = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");

/** Lignes d'en-têtes (indentées) qui suivent la règle `chemin`, jusqu'à la règle suivante. */
function headersOf(path: string): string[] {
  const lines = headers.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === path && !line.startsWith(" "));
  if (start === -1) return [];
  const rule: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    rule.push(line.trim());
  }
  return rule;
}

describe("public/_headers", () => {
  it("protège /annuler* : pas de Referer sortant, pas d'indexation", () => {
    expect(headersOf("/annuler*")).toEqual([
      "Referrer-Policy: no-referrer",
      "X-Robots-Tag: noindex",
    ]);
  });

  it("protège /admin* : pas d'indexation, pas d'iframe, manifeste servi avec son type", () => {
    expect(headersOf("/admin*")).toEqual([
      "X-Robots-Tag: noindex",
      "X-Frame-Options: DENY",
      "Content-Security-Policy: frame-ancestors 'none'",
    ]);
    expect(headersOf("/admin.webmanifest")).toEqual(["Content-Type: application/manifest+json"]);
  });

  it("ne contient aucun jeton ni aucune adresse réelle", () => {
    expect(headers).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
