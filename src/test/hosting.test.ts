import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Fichiers d'hébergement Cloudflare Pages (ADR 0007, docs/DEPLOIEMENT.md) : `public/_headers`,
 * `public/robots.txt`, l'absence de `_redirects` et de `404.html` (repli SPA par défaut), et le
 * workflow anti-pause. Lecture de fichiers seulement : aucun réseau, aucun Supabase.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// ------------------------------------------------------------------------------------------
// Calcul des en-têtes EFFECTIFS d'une URL, comme Cloudflare Pages : toutes les règles qui
// correspondent s'appliquent dans l'ordre du fichier ; un même en-tête posé deux fois est
// envoyé avec les deux valeurs jointes par une virgule ; « ! Nom » retire la valeur héritée.
// ------------------------------------------------------------------------------------------
type Rule = { pattern: RegExp; lines: string[] };

function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      rules.at(-1)!.lines.push(line.trim());
    } else {
      rules.push({ pattern: toRegExp(line.trim()), lines: [] });
    }
  }
  return rules;
}

/** `*` = n'importe quoi ; `:nom` = un segment (sans « . » dans l'hôte, sans « / » dans le chemin). */
function toRegExp(rule: string): RegExp {
  const absolute = /^https?:\/\//.test(rule);
  const body = rule
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/:[a-z]+/g, "[^./]+");
  // Une règle par chemin vaut pour tous les hôtes.
  return new RegExp(absolute ? `^${body}$` : `^https?://[^/]+${body}$`);
}

/** En-têtes effectifs (nom en minuscules → liste des valeurs envoyées). */
function effectiveHeaders(url: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const rule of parseHeaders(read("public/_headers"))) {
    if (!rule.pattern.test(url)) continue;
    for (const line of rule.lines) {
      if (line.startsWith("! ")) {
        result.delete(line.slice(2).trim().toLowerCase());
        continue;
      }
      const sep = line.indexOf(":");
      const name = line.slice(0, sep).trim().toLowerCase();
      result.set(name, [...(result.get(name) ?? []), line.slice(sep + 1).trim()]);
    }
  }
  return result;
}

/** Valeur unique d'un en-tête (échoue s'il est absent ou envoyé deux fois). */
function header(url: string, name: string): string {
  const values = effectiveHeaders(url).get(name.toLowerCase()) ?? [];
  expect(values, `${name} sur ${url}`).toHaveLength(1);
  return values[0]!;
}

const SITE = "https://cutsbyalix.example";
const PREVIEW = "https://abc123.site-barber.pages.dev";
const URLS = [
  `${SITE}/`,
  `${SITE}/index.html`,
  `${SITE}/reserver`,
  `${SITE}/annuler`,
  `${SITE}/admin`,
  `${SITE}/admin/galerie`,
  `${SITE}/admin.webmanifest`,
  `${SITE}/admin-icon-192.png`,
  `${SITE}/assets/index-AbC123.js`,
  `${SITE}/robots.txt`,
  "https://site-barber.pages.dev/",
  `${PREVIEW}/annuler`,
  `${PREVIEW}/admin`,
];

describe("public/_headers : en-têtes effectifs", () => {
  it("aucune URL ne reçoit deux fois le même en-tête (valeurs jointes par une virgule)", () => {
    for (const url of URLS) {
      for (const [name, values] of effectiveHeaders(url)) {
        expect(values, `${name} envoyé ${values.length} fois sur ${url}`).toHaveLength(1);
      }
    }
  });

  it("tout le site : nosniff, anti-iframe, Referrer-Policy, Permissions-Policy fermée", () => {
    for (const url of URLS) {
      expect(header(url, "X-Content-Type-Options")).toBe("nosniff");
      expect(header(url, "X-Frame-Options")).toBe("DENY");
      const permissions = header(url, "Permissions-Policy");
      for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
        expect(permissions).toContain(`${feature}=()`);
      }
      // Utilisés par le site : jamais coupés (vidéo du hero, copie du lien d'annulation).
      expect(permissions).not.toMatch(/autoplay|clipboard/);
    }
    expect(header(`${SITE}/`, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("noindex, nofollow partout tant que le site n'est pas public", () => {
    for (const url of URLS) expect(header(url, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("noindex conservé sans la règle globale : aperçus *.pages.dev, /annuler, /admin", () => {
    // Simule la mise en ligne : on retire le noindex de la règle /*.
    const golive = read("public/_headers").replace(/^\s+X-Robots-Tag:.*$/m, "");
    const robotsOf = (url: string) => {
      let value: string | undefined;
      for (const rule of parseHeaders(golive)) {
        if (!rule.pattern.test(url)) continue;
        for (const line of rule.lines) {
          if (line === "! X-Robots-Tag") value = undefined;
          if (line.startsWith("X-Robots-Tag:")) value = line.split(": ")[1];
        }
      }
      return value;
    };
    expect(robotsOf(`${SITE}/`)).toBeUndefined();
    expect(robotsOf("https://site-barber.pages.dev/")).toBe("noindex, nofollow");
    expect(robotsOf(`${PREVIEW}/`)).toBe("noindex, nofollow");
    expect(robotsOf(`${SITE}/annuler`)).toBe("noindex, nofollow");
    expect(robotsOf(`${SITE}/admin`)).toBe("noindex, nofollow");
    expect(robotsOf(`${SITE}/media/galerie/coupe-01.webp`)).toBe("noindex, nofollow, noimageindex");
  });

  it("photos de la vitrine : jamais indexées (ni la page, ni l'image), un seul X-Robots-Tag", () => {
    const photo = `${SITE}/media/galerie/coupe-01.webp`;
    expect(header(photo, "X-Robots-Tag")).toBe("noindex, nofollow, noimageindex");
    expect(header(photo, "X-Content-Type-Options")).toBe("nosniff");
  });

  it("/annuler : aucun Referer (le jeton est dans le fragment de l'URL)", () => {
    expect(header(`${SITE}/annuler`, "Referrer-Policy")).toBe("no-referrer");
    expect(header(`${PREVIEW}/annuler`, "Referrer-Policy")).toBe("no-referrer");
  });

  it("/admin : frame-ancestors en blocage ; manifeste servi avec son type", () => {
    expect(header(`${SITE}/admin`, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(header(`${SITE}/admin.webmanifest`, "Content-Type")).toBe("application/manifest+json");
    // Hors admin, aucune CSP en blocage : seulement la version Report-Only.
    expect(effectiveHeaders(`${SITE}/`).has("content-security-policy")).toBe(false);
  });

  it("CSP Report-Only : tout en 'self', Supabase seul autorisé, ni inline ni eval", () => {
    const csp = header(`${SITE}/`, "Content-Security-Policy-Report-Only");
    const supabase = "https://ffamilzutmiukspofcmf.supabase.co";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self';");
    // 'self' : l'import des photos de la vitrine lit /media/galerie/ (même domaine).
    expect(csp).toContain(`connect-src 'self' ${supabase};`);
    expect(csp).toContain(`img-src 'self' data: blob: ${supabase};`);
    expect(csp).toContain("media-src 'self';");
    expect(csp).toContain("font-src 'self';");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*\.supabase\.co/);
  });

  it("cache d'un an UNIQUEMENT sur /assets/* (noms hachés), jamais sur index.html", () => {
    expect(header(`${SITE}/assets/index-AbC123.js`, "Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    for (const url of [`${SITE}/`, `${SITE}/index.html`, `${SITE}/admin`, `${SITE}/annuler`]) {
      expect(effectiveHeaders(url).has("cache-control"), url).toBe(false);
    }
  });

  it("ne contient aucun jeton ni aucune adresse réelle", () => {
    expect(read("public/_headers")).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });
});

describe("repli SPA, robots.txt, Vercel", () => {
  it("aucun _redirects ni 404.html : Pages sert index.html pour toute URL qui n'est pas un fichier", () => {
    expect(existsSync(resolve(root, "public/_redirects"))).toBe(false);
    expect(existsSync(resolve(root, "public/404.html"))).toBe(false);
    // Le build n'existe pas toujours quand les tests tournent ; la CI le revérifie après le build.
    if (existsSync(resolve(root, "dist"))) {
      expect(existsSync(resolve(root, "dist/404.html"))).toBe(false);
      expect(existsSync(resolve(root, "dist/_redirects"))).toBe(false);
    }
  });

  it("robots.txt sans Disallow : les robots doivent pouvoir lire le noindex", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).not.toMatch(/^Disallow:/im);
  });

  it("plus aucune configuration Vercel", () => {
    expect(existsSync(resolve(root, "vercel.json"))).toBe(false);
  });
});

describe("workflow anti-pause Supabase", () => {
  const workflow = read(".github/workflows/anti-pause.yml");

  it("planifié tous les 3 jours, et lançable à la main", () => {
    expect(workflow).toContain('- cron: "0 6 */3 * *"');
    expect(workflow).toMatch(/^\s+workflow_dispatch:/m);
  });

  it("une seule lecture publique, clé lue dans les secrets, échec si la réponse n'est pas 200", () => {
    expect(workflow).toContain("${{ secrets.SUPABASE_URL }}");
    expect(workflow).toContain("${{ secrets.SUPABASE_ANON_KEY }}");
    expect(workflow).toContain('"$SUPABASE_URL/rest/v1/services?select=id&limit=1"');
    expect(workflow.match(/curl /g)).toHaveLength(1);
    expect(workflow).toContain('if [ "$status" != "200" ]');
    expect(workflow).toContain("permissions: {}");
    // Seuls les secrets publics sont lus (le mot « service_role » n'apparaît qu'en commentaire).
    expect(workflow.match(/secrets.[A-Z_]+/g)).toEqual([
      "secrets.SUPABASE_URL",
      "secrets.SUPABASE_ANON_KEY",
    ]);
  });
});

describe("aucun secret dans le dépôt", () => {
  /** Fichiers texte d'un dossier, récursivement. */
  function files(dir: string): string[] {
    return readdirSync(resolve(root, dir)).flatMap((name) => {
      const path = join(dir, name);
      return statSync(resolve(root, path)).isDirectory() ? files(path) : [path];
    });
  }

  // Motif assemblé en morceaux : ce fichier ne doit pas se détecter lui-même.
  const secret = new RegExp(["eyJhbGci", "Oi|sb_", "secret_|sbp_", "[0-9a-f]{20}"].join(""));
  const ROOT_FILES = [
    "package.json",
    "vite.config.ts",
    "playwright.config.ts",
    "eslint.config.js",
    "index.html",
    ".mcp.json",
    ".env.example",
    "CLAUDE.md",
    "README.md",
  ];

  it("ni JWT (clé anon ou service_role) ni clé Supabase dans le code, les tests, la base, la doc", () => {
    const text = ["src", "public", ".github", "docs", "e2e", "supabase"]
      .flatMap(files)
      // Fichiers locaux ignorés par git (lien au projet distant, état de la CLI).
      .filter((path) => !/^supabase[\\/]\.(temp|branches)/.test(path))
      .concat(ROOT_FILES.filter((path) => existsSync(resolve(root, path))))
      .filter((path) => !/\.(png|jpe?g|webp|mp4|woff2?)$/i.test(path))
      .map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const);
    for (const [path, content] of text) {
      expect(content, path).not.toMatch(secret);
    }
  });
});
