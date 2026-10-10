import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Manifeste de la PWA admin (public/admin.webmanifest), lié depuis /admin uniquement. */
const PUBLIC_DIR = resolve(process.cwd(), "public");
const manifest = JSON.parse(readFileSync(resolve(PUBLIC_DIR, "admin.webmanifest"), "utf8")) as {
  name: string;
  short_name: string;
  id: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
};

describe("public/admin.webmanifest", () => {
  it("ouvre l'admin en application autonome, limitée à /admin", () => {
    expect(manifest).toMatchObject({
      name: "Cuts by Alix — Admin",
      id: "/admin",
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
    });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("déclare des icônes 192 et 512 px qui existent vraiment, dont une « maskable »", () => {
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(PUBLIC_DIR, icon.src.slice(1))), icon.src).toBe(true);
    }
    // Icône de l'écran d'accueil iOS (apple-touch-icon), liée depuis AdminHead.
    expect(existsSync(resolve(PUBLIC_DIR, "admin-icon-180.png"))).toBe(true);
  });
});
