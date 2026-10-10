import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, mockRpc, rpcError, test, type RpcResponse } from "./fixtures.ts";

/**
 * Page /annuler (Android, iPhone, desktop) contre des RPC Supabase INTERCEPTÉES : aucune
 * requête n'atteint une vraie base (e2e/fixtures.ts coupe tout ce qui n'est pas simulé). Les
 * réponses ont des dates FIXES : la page affiche ce que la base renvoie, rien ne dépend de la
 * date du jour (la règle des 24 h est testée en SQL, test pgTAP 11).
 */

const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";

/** Ligne renvoyée par get_booking (ni adresse, ni téléphone, ni email). */
const ROW = {
  status: "confirmed",
  starts_at: "2030-03-12T13:00:00+00:00", // mardi 12 mars 2030, 14 h à Paris
  ends_at: "2030-03-12T14:00:00+00:00",
  service_name: "Coupe + barbe",
  location_label: "Angers",
  first_name: "Lucas",
  can_cancel: true,
};

/** Simule get_booking et cancel_booking ; renvoie ce que le site a envoyé. */
async function mockBooking(
  page: Page,
  {
    booking = { body: [ROW] },
    cancel = { body: true },
  }: { booking?: RpcResponse; cancel?: RpcResponse } = {},
) {
  const sent = { get: [] as unknown[], cancel: [] as unknown[] };
  await mockRpc(page, "get_booking", (args) => {
    sent.get.push(args);
    return booking;
  });
  await mockRpc(page, "cancel_booking", (args) => {
    sent.cancel.push(args);
    return cancel;
  });
  return sent;
}

async function expectNoAxeViolation(page: Page) {
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
}

async function demanderLAnnulation(page: Page) {
  await page.getByRole("button", { name: "Annuler mon rendez-vous" }).click();
  await expect(page.getByText("L'annulation est définitive. Tu confirmes ?")).toBeVisible();
}

test("lien valide : récapitulatif sans adresse, puis annulation en deux temps", async ({
  page,
}) => {
  const sent = await mockBooking(page);
  await page.goto(`/annuler?token=${TOKEN}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" }),
  ).toBeVisible();
  // Prestation, date, heure de Paris, ville : rien d'autre.
  await expect(page.getByText("Coupe + barbe")).toBeVisible();
  await expect(page.getByText("mardi 12 mars")).toBeVisible();
  await expect(page.getByText("14:00 – 15:00")).toBeVisible();
  await expect(page.getByText("Angers")).toBeVisible();
  await expect(page.locator("dt", { hasText: /^Adresse$/ })).toHaveCount(0);
  await expectNoAxeViolation(page);

  await demanderLAnnulation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Réserver un créneau" })).toBeVisible();
  await expectNoAxeViolation(page);

  // Le jeton part dans le corps des requêtes. (En dev, React StrictMode lance l'effet de
  // chargement deux fois au montage : plusieurs lectures sont normales, une seule annulation.)
  expect(sent.get.length).toBeGreaterThanOrEqual(1);
  expect(
    sent.get.every((args) => JSON.stringify(args) === JSON.stringify({ p_token: TOKEN })),
  ).toBe(true);
  expect(sent.cancel).toEqual([{ p_token: TOKEN }]);
});

test("trop tard : moins de 24 h avant le RDV", async ({ page }) => {
  await mockBooking(page, { booking: { body: [{ ...ROW, can_cancel: false }] } });
  await page.goto(`/annuler?token=${TOKEN}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Trop tard pour annuler en ligne" }),
  ).toBeVisible();
  await expect(page.getByText(/jusqu'à 24 h avant/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
  await expectNoAxeViolation(page);
});

test("trop tard au moment d'annuler : la base refuse (too_late)", async ({ page }) => {
  await mockBooking(page, { cancel: rpcError("too_late") });
  await page.goto(`/annuler?token=${TOKEN}`);

  await demanderLAnnulation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Trop tard pour annuler en ligne" }),
  ).toBeFocused();
});

test("RDV déjà annulé", async ({ page }) => {
  await mockBooking(page, {
    booking: { body: [{ ...ROW, status: "cancelled", can_cancel: false }] },
  });
  await page.goto(`/annuler?token=${TOKEN}`);

  await expect(
    page.getByRole("heading", { level: 2, name: "Rendez-vous déjà annulé" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
  await expectNoAxeViolation(page);
});

test("lien invalide : même écran pour absent, mal formé, inconnu et expiré", async ({ page }) => {
  // Inconnu et expiré : la base répond pareil (aucune ligne). Absent et mal formé : le site
  // n'interroge même pas la base.
  const sent = await mockBooking(page, { booking: { body: [] } });
  const cas = [
    ["sans jeton", "/annuler", false],
    ["jeton mal formé", "/annuler?token=pas-un-uuid", false],
    ["jeton inconnu ou expiré", `/annuler?token=${TOKEN}`, true],
  ] as const;

  const ecrans: string[] = [];
  for (const [nom, url, interroge] of cas) {
    const avant = sent.get.length;
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 2, name: "Lien invalide" }), nom).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler mon rendez-vous" })).toHaveCount(0);
    const appels = sent.get.length - avant;
    if (interroge) expect(appels, `${nom} : appels à get_booking`).toBeGreaterThanOrEqual(1);
    else expect(appels, `${nom} : aucun appel à get_booking`).toBe(0);
    ecrans.push(await page.locator("main").innerText());
  }
  expect(new Set(ecrans).size, "les trois écrans sont identiques").toBe(1);
  await expectNoAxeViolation(page);
});

test("erreur réseau au chargement : message, puis « Réessayer »", async ({ page }) => {
  // Réseau coupé jusqu'au clic sur « Réessayer » (et non « au premier appel » : StrictMode
  // lance le chargement deux fois au montage, en dev).
  let coupe = true;
  await mockRpc(page, "get_booking", () => (coupe ? "network-error" : { body: [ROW] }));
  await page.goto(`/annuler?token=${TOKEN}`);

  await expect(page.getByRole("alert")).toContainText("Impossible de charger ton rendez-vous");
  await expect(page.getByText(TOKEN)).toHaveCount(0);
  coupe = false;
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" }),
  ).toBeVisible();
});

test("erreur réseau pendant l'annulation : message, puis nouvel essai en un appui", async ({
  page,
}) => {
  let echecs = 1;
  await mockRpc(page, "get_booking", () => ({ body: [ROW] }));
  await mockRpc(page, "cancel_booking", () => (echecs-- > 0 ? "network-error" : { body: true }));
  await page.goto(`/annuler?token=${TOKEN}`);

  await demanderLAnnulation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("alert")).toContainText("L'annulation n'a pas pu être envoyée");

  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeVisible();
});

test("double clic sur « Oui, annuler » : une seule annulation envoyée", async ({ page }) => {
  const sent = await mockBooking(page);
  await page.goto(`/annuler?token=${TOKEN}`);

  await demanderLAnnulation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).dblclick();

  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeVisible();
  expect(sent.cancel).toHaveLength(1);
});

test("confidentialité : no-referrer et noindex sur la page, jamais le jeton ailleurs", async ({
  page,
}) => {
  const sorties: string[] = [];
  const consoleMessages: string[] = [];
  const erreurs: string[] = [];
  page.on("console", (m) => consoleMessages.push(m.text()));
  page.on("pageerror", (e) => erreurs.push(e.message));
  const referers: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.host !== "localhost:5173") {
      sorties.push(`${url.pathname}${url.search}`);
      referers.push(r.headers()["referer"] ?? "");
    }
  });
  await mockBooking(page);

  await page.goto(`/annuler?token=${TOKEN}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Lucas, ton rendez-vous" }),
  ).toBeVisible();
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('head meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
  await demanderLAnnulation(page);
  await page.getByRole("button", { name: "Oui, annuler" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est annulé" })).toBeVisible();

  // Seules des requêtes vers l'API Supabase, jamais avec le jeton dans l'URL ; rien dans la console.
  expect(sorties.filter((path) => !path.startsWith("/rest/v1/"))).toEqual([]);
  expect(sorties.filter((path) => path.includes(TOKEN))).toEqual([]);
  expect(consoleMessages.filter((m) => m.includes(TOKEN))).toEqual([]);
  // Le Referer des requêtes vers un autre hôte (Supabase) ne contient jamais le jeton.
  expect(referers.filter((value) => value.includes(TOKEN))).toEqual([]);
  expect(erreurs).toEqual([]);

  // En quittant la page (navigation interne), les consignes ne s'appliquent plus aux autres pages.
  await page.getByRole("link", { name: "Réserver un créneau" }).click();
  await expect(page).toHaveURL(/\/reserver$/);
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('head meta[name="referrer"]')).toHaveCount(0);
});
