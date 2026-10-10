// @vitest-environment node
import { fileURLToPath } from "node:url";
import { build, type Rolldown } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Preuve que l'ancien faux état connecté (développement) ne revient JAMAIS en production : on
 * fait un vrai build de production (en mémoire, sans écrire dist/) et on cherche dans le
 * JavaScript livré sa clé de stockage et son texte d'aide. Le faux login a été supprimé avec la
 * vraie connexion Supabase (consigne 17) ; ce test garde la porte fermée.
 */
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("build de production", () => {
  it("ne contient pas le faux état connecté de l'admin", { timeout: 120_000 }, async () => {
    // Vitest fixe NODE_ENV=test ; or Vite en déduit `import.meta.env.DEV`. Sans ceci, le
    // build lancé depuis le test garderait DEV = true et ne prouverait rien.
    vi.stubEnv("NODE_ENV", "production");
    const result = await build({
      root: ROOT,
      mode: "production",
      logLevel: "silent",
      build: { write: false },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Rolldown.RolldownOutput[];
    const code = outputs
      .flatMap((output) => output.output)
      .filter((file): file is Rolldown.OutputChunk => file.type === "chunk")
      .map((chunk) => chunk.code)
      .join("\n");

    // Garde-fou : on inspecte bien l'application (sinon le test passerait à vide).
    expect(code).toContain("Espace admin");
    // La vraie connexion est bien là (clé de stockage de la session admin).
    expect(code).toContain("cutsbyalix-admin-auth");
    expect(code).not.toContain("cutsbyalix:dev-admin-session");
    // Ni l'aide « connexion factice » affichée sous le formulaire de connexion.
    expect(code).not.toContain("connexion factice");
  });

  it("refuse un build qui ne serait pas de production (NODE_ENV=development)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(
      build({ root: ROOT, mode: "production", logLevel: "silent", build: { write: false } }),
    ).rejects.toThrow(/Build refusé/);
  });
});
