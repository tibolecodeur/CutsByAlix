import { AxeBuilder } from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import {
  addDaysToKey,
  formatDayKey,
  isoWeekday,
  parisDateTime,
  parisDayKey,
  type DayKey,
} from "../src/lib/dates.ts";
import { expect, mockRpc, rpcError, test, type RpcResponse } from "./fixtures.ts";

/**
 * Parcours /reserver (Android, iPhone, desktop) contre des RPC Supabase INTERCEPTÉES : aucune
 * requête n'atteint une vraie base (e2e/fixtures.ts coupe tout ce qui n'est pas simulé).
 * Créneaux simulés : chaque jour sauf le lundi, 14:00 « Les Ponts-de-Cé » et 15:10
 * « Saint-Christophe-du-Bois » (heure de Paris). Règle affichée : rien à moins de 2 h (jour entièrement
 * trop proche : le site n'interroge même pas la base).
 */

const PONTS_DE_CE = "a11ce000-0000-4000-8000-000000000101";
const SAINT_CHRISTOPHE = "a11ce000-0000-4000-8000-000000000102";
const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";
const HOUR_MS = 3_600_000;

type SlotRow = { starts_at: string; ends_at: string; location_id: string; location_label: string };

function slot(day: DayKey, start: string, end: string, locationId: string, label: string): SlotRow {
  return {
    starts_at: parisDateTime(day, start).toISOString(),
    ends_at: parisDateTime(day, end).toISOString(),
    location_id: locationId,
    location_label: label,
  };
}

function slotsFor(day: DayKey): SlotRow[] {
  if (isoWeekday(day) === 1) return [];
  return [
    slot(day, "14:00", "15:00", PONTS_DE_CE, "Les Ponts-de-Cé"),
    slot(day, "15:10", "16:10", SAINT_CHRISTOPHE, "Saint-Christophe-du-Bois"),
  ];
}

/** Premier jour (à Paris) 48 h plus tard avec des créneaux simulés (pas un lundi) : au-delà de 24 h, donc sans avertissement. */
function firstDayWithSlots(): DayKey {
  let day = parisDayKey(new Date(Date.now() + 48 * HOUR_MS));
  while (isoWeekday(day) === 1) day = addDaysToKey(day, 1);
  return day;
}

/** Récap renvoyé par create_booking pour ce créneau (sans adresse, comme la vraie RPC). */
function receiptFor(row: SlotRow) {
  return [
    {
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      service_name: "Coupe",
      location_label: row.location_label,
      cancel_token: TOKEN,
    },
  ];
}

/**
 * Jours que la base annoncerait (get_available_days) : les 28 jours à partir d'aujourd'hui (Paris),
 * sans ceux qui sont entièrement à moins de 2 h, et seulement ceux qui ont des créneaux simulés
 * (donc sans les lundis).
 */
function daysFor(now: Date): { day: string; slot_count: number }[] {
  const today = parisDayKey(now);
  const first = parisDayKey(new Date(now.getTime() + 2 * HOUR_MS));
  return Array.from({ length: 28 }, (_, i) => addDaysToKey(today, i))
    .filter((day) => day >= first)
    .map((day) => ({ day, slot_count: slotsFor(day).length }))
    .filter((row) => row.slot_count > 0);
}

/**
 * get_available_slots simulée (renvoie la liste des jours demandés par le site) et
 * get_available_days, déduite des mêmes créneaux. `now` : l'heure simulée du navigateur, quand
 * le test fige l'horloge.
 */
async function mockSlots(
  page: Page,
  respond = (day: DayKey): RpcResponse => ({ body: slotsFor(day) }),
  now = new Date(),
) {
  await mockRpc(page, "get_available_days", () => ({ body: daysFor(now) }));
  const requested: string[] = [];
  await mockRpc(page, "get_available_slots", (args) => {
    requested.push(String(args.p_day));
    return respond(String(args.p_day));
  });
  return requested;
}

/** Les jours du calendrier ont un bouton radio masqué : on touche son libellé visible. */
async function toucherJour(page: Page, day: DayKey) {
  const jour = page.getByRole("radio", { name: formatDayKey(day) });
  await jour.locator("xpath=ancestor::label[1]").click();
  await expect(jour).toBeChecked();
}

async function continuer(page: Page) {
  await page.getByRole("button", { name: "Continuer" }).click();
}

/** Étape 1 : prestation « Coupe ». On arrive directement au choix du jour et du créneau. */
async function allerAuxCreneaux(page: Page) {
  await page.goto("/reserver");
  await expect(page.getByRole("heading", { level: 2, name: "Quelle prestation ?" })).toBeVisible();
  await page
    .getByRole("radio", { name: /^Coupe/ })
    .first()
    .check();
  await continuer(page);
  await expect(
    page.getByRole("heading", { level: 2, name: "Quel jour, quelle heure ?" }),
  ).toBeFocused();
  await expect(page.getByText("Étape 2 sur 4")).toBeVisible();
}

function groupeCreneaux(page: Page): Locator {
  return page.getByRole("group", { name: /^Créneaux libres/ });
}

/** Valeur d'une ligne du récapitulatif (<dt>libellé</dt><dd>valeur</dd>). */
function valeurDuRecap(page: Page, libelle: string): Locator {
  return page
    .locator("dt", { hasText: new RegExp(`^${libelle}$`) })
    .locator("xpath=following-sibling::dd[1]");
}

async function remplirCoordonnees(page: Page) {
  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Durand");
  await page.getByLabel("Email").fill("zoe@example.com");
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await continuer(page);
}

/** Réservation rapide jusqu'au récapitulatif (premier créneau du premier jour possible). */
async function allerAuRecap(page: Page) {
  await allerAuxCreneaux(page);
  await toucherJour(page, firstDayWithSlots());
  await groupeCreneaux(page).getByRole("radio").first().check();
  await continuer(page);
  await remplirCoordonnees(page);
  await expect(page.getByRole("heading", { level: 2, name: "Vérifie et confirme" })).toBeVisible();
  await expect(page.getByText(/Paiement en liquide ou par virement./)).toBeVisible();
}

async function reserverJusquALaConfirmation(page: Page) {
  await mockSlots(page);
  await mockRpc(page, "create_booking", () => ({
    body: receiptFor(slotsFor(firstDayWithSlots())[0]!),
  }));
  await allerAuRecap(page);
  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
  await expect(page.getByText("En liquide ou par virement")).toBeVisible();
}

test("parcours complet : créneau réel, lieu du créneau envoyé, confirmation sans adresse", async ({
  page,
}) => {
  const erreurs: string[] = [];
  const consoleMessages: string[] = [];
  // Requêtes qui quittent le site. L'hôte Supabase dépend du serveur (URL factice, ou celle de
  // .env.local si un serveur de dev déjà lancé est réutilisé) : ces appels sont de toute façon
  // interceptés par e2e/fixtures.ts. On vérifie qu'il n'y a QUE l'API Supabase, aucun tiers.
  const sorties: string[] = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => consoleMessages.push(m.text()));
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.host !== "localhost:5173") sorties.push(url.pathname);
  });

  const day = firstDayWithSlots();
  const [, secondSlot] = slotsFor(day);
  await mockSlots(page);
  let envoye: Record<string, unknown> = {};
  await mockRpc(page, "create_booking", (args) => {
    envoye = args;
    return { body: receiptFor(secondSlot!) };
  });

  // Étape 1 : impossible de continuer sans prestation.
  await page.goto("/reserver");
  await expect(page.getByText("Étape 1 sur 4")).toBeVisible();
  await continuer(page);
  await expect(page.getByText("Choisis une prestation pour continuer.")).toBeVisible();
  await allerAuxCreneaux(page);

  // Étape 2 : jour puis créneau. Le client ne choisit jamais de lieu.
  await expect(page.getByRole("heading", { name: "Où ?" })).toHaveCount(0);
  await continuer(page);
  await expect(page.getByText("Choisis un jour, puis un créneau.")).toBeVisible();
  await toucherJour(page, day);
  const creneaux = groupeCreneaux(page);
  // `evaluateAll` ne patiente pas : on attend d'abord que les créneaux soient chargés.
  await expect(creneaux.getByRole("radio")).toHaveCount(2);
  const textes = await creneaux
    .getByRole("radio")
    .evaluateAll((els) =>
      els.map((el) => el.closest("label")!.textContent!.replace(/\s+/g, " ").trim()),
    );
  // Heures de Paris, chacune avec la ville de son lieu.
  expect(textes).toEqual(["14:00 – 15:00Les Ponts-de-Cé", "15:10 – 16:10Saint-Christophe-du-Bois"]);
  await creneaux.getByRole("radio").nth(1).check();
  await continuer(page);

  // Étape 3 : coordonnées, avec validation.
  await expect(page.getByRole("heading", { level: 2, name: "Tes coordonnées" })).toBeFocused();
  await continuer(page);
  await expect(page.getByText("Indique ton prénom.")).toBeVisible();
  await expect(page.getByLabel("Prénom")).toBeFocused();
  await page.getByLabel("Prénom").fill("Zoé");
  await page.getByLabel("Nom", { exact: true }).fill("Durand");
  await page.getByLabel("Téléphone").fill("06 39 98 00 10");
  await page.getByRole("checkbox", { name: /J'accepte/ }).check();
  await continuer(page);

  // Étape 4 : récapitulatif, puis envoi.
  await expect(page.getByRole("heading", { level: 2, name: "Vérifie et confirme" })).toBeFocused();
  await expect(valeurDuRecap(page, "Lieu")).toHaveText("Saint-Christophe-du-Bois");
  // Adresse : annoncée sur Instagram, sans lien qui ferait quitter le parcours avant d'envoyer.
  await expect(
    page.getByText(/L'adresse exacte n'est pas affichée sur le site : une fois réservé/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Instagram/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmer la réservation" }).click();

  // Confirmation : date, heure de Paris, prestation, ville, lien ; pas d'adresse.
  await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeFocused();
  await expect(valeurDuRecap(page, "Prestation")).toHaveText("Coupe");
  await expect(valeurDuRecap(page, "Date")).toHaveText(formatDayKey(day));
  await expect(valeurDuRecap(page, "Heure")).toHaveText("15:10 – 16:10");
  await expect(valeurDuRecap(page, "Lieu")).toHaveText("Saint-Christophe-du-Bois");
  await expect(page.locator("dt", { hasText: /^Adresse$/ })).toHaveCount(0);
  await expect(page.getByText(/pas d'e-mail de confirmation/)).toBeVisible();
  await expect(page.locator("#cancel-link-url")).toHaveText(new RegExp(`/annuler#${TOKEN}$`));
  await expect(
    page.getByText(/écris à Alix en message privé sur Instagram pour la recevoir/),
  ).toBeVisible();
  const instagram = page.getByRole("link", { name: /@CutsByAlix sur Instagram/ });
  await expect(instagram).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
  await expect(instagram).toHaveAttribute("target", "_blank");
  expect((await instagram.getAttribute("rel"))?.split(" ")).toEqual(
    expect.arrayContaining(["noopener", "noreferrer"]),
  );
  // L'ancien libellé n'apparaît nulle part, et le jeton n'est dans aucun lien sauf l'annulation.
  await expect(page.getByText("Angers")).toHaveCount(0);
  const hrefs = await page
    .locator("a[href]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  expect(hrefs.filter((href) => href.includes(TOKEN))).toEqual([`/annuler#${TOKEN}`]);

  // Ce que le site a envoyé : le créneau ET le lieu du créneau choisi, honeypot vide.
  expect(envoye).toMatchObject({
    p_starts_at: secondSlot!.starts_at,
    p_location_id: SAINT_CHRISTOPHE,
    p_first_name: "Zoé",
    p_last_name: "Durand",
    p_phone: "06 39 98 00 10",
    p_email: null,
    p_website: null,
  });

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);

  // Le jeton ne part nulle part ailleurs et n'apparaît pas dans la console.
  expect(sorties.filter((path) => !path.startsWith("/rest/v1/"))).toEqual([]);
  expect(consoleMessages.filter((m) => m.includes(TOKEN))).toEqual([]);
  expect(erreurs).toEqual([]);
});

test("délai de 2 h : expliqué ; à 22 h 01 aujourd'hui est grisé et non cliquable", async ({
  page,
}) => {
  const maintenant = new Date("2026-10-13T20:01:00Z"); // mardi 13, 22 h 01 à Paris
  await page.clock.setFixedTime(maintenant);
  const requested = await mockSlots(page, undefined, maintenant);
  await allerAuxCreneaux(page);
  await expect(page.getByText(/On réserve au plus tard 2 h avant le rendez-vous/)).toBeVisible();

  const aujourdhui = page.getByRole("radio", { name: formatDayKey("2026-10-13") });
  await expect(aujourdhui).toBeDisabled();
  await expect(aujourdhui).toHaveAccessibleName(
    `${formatDayKey("2026-10-13")}, aucun créneau disponible`,
  );
  await expect(page.getByRole("radio", { name: formatDayKey("2026-10-14") })).toBeEnabled();
  expect(requested).not.toContain("2026-10-13");
});

test("délai de 2 h, jours impossibles à charger : « Trop tard » explique la règle sans appel à la base", async ({
  page,
}) => {
  const maintenant = new Date("2026-10-13T20:01:00Z"); // mardi 13, 22 h 01 à Paris
  await page.clock.setFixedTime(maintenant);
  const requested = await mockSlots(page, undefined, maintenant);
  await mockRpc(page, "get_available_days", () => "network-error");
  await allerAuxCreneaux(page);

  await toucherJour(page, "2026-10-13");
  await expect(
    page.getByText(`Trop tard pour réserver le ${formatDayKey("2026-10-13")}.`),
  ).toBeVisible();
  await expect(page.getByText(/Choisis un jour à partir du/)).toBeVisible();
  expect(requested).not.toContain("2026-10-13");
});

test("délai de 2 h : à 21 h 59, aujourd'hui reste réservable", async ({ page }) => {
  const maintenant = new Date("2026-10-13T19:59:00Z"); // mardi 13, 21 h 59 à Paris
  await page.clock.setFixedTime(maintenant);
  const requested = await mockSlots(page, undefined, maintenant);
  await allerAuxCreneaux(page);

  await toucherJour(page, "2026-10-13");
  await expect(page.getByText(/Trop tard pour réserver/)).toHaveCount(0);
  await expect(groupeCreneaux(page).getByRole("radio")).toHaveCount(2);
  expect(requested).toContain("2026-10-13");
});

test("RDV à moins de 24 h : récapitulatif et confirmation préviennent, sans rien bloquer", async ({
  page,
}) => {
  const maintenant = new Date("2026-10-13T09:00:00Z"); // mardi 13, 11 h à Paris
  await page.clock.setFixedTime(maintenant);
  await mockSlots(page, undefined, maintenant);
  // Créneau de 14 h le jour même : dans 3 h (au-delà du délai de 2 h), donc à moins de 24 h.
  await mockRpc(page, "create_booking", () => ({
    body: receiptFor(slotsFor("2026-10-13")[0]!),
  }));
  await allerAuxCreneaux(page);
  await toucherJour(page, "2026-10-13");
  await groupeCreneaux(page).getByRole("radio").first().check();
  await continuer(page);
  await remplirCoordonnees(page);

  await expect(page.getByText(/tu ne pourras pas l'annuler en ligne/)).toBeVisible();
  await expect(page.getByText(/Tu pourras annuler en ligne/)).toHaveCount(0);

  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
  await expect(page.getByText(/dans moins de 24 h : tu ne pourras pas l'annuler/)).toBeVisible();
  await expect(page.getByText(/contacte Alix directement/)).toBeVisible();
  // Le lien reste affiché : l'avertissement ne bloque rien.
  await expect(page.locator("#cancel-link-url")).toHaveText(new RegExp(`/annuler#${TOKEN}$`));
});

test("RDV à plus de 24 h : aucun avertissement", async ({ page }) => {
  const maintenant = new Date("2026-10-13T10:00:00Z");
  await page.clock.setFixedTime(maintenant);
  await mockSlots(page, undefined, maintenant);
  await mockRpc(page, "create_booking", () => ({
    body: receiptFor(slotsFor("2026-10-15")[0]!),
  }));
  await allerAuxCreneaux(page);
  await toucherJour(page, "2026-10-15");
  await groupeCreneaux(page).getByRole("radio").first().check();
  await continuer(page);
  await remplirCoordonnees(page);
  await expect(page.getByText(/Tu pourras annuler en ligne jusqu'à 24 h avant/)).toBeVisible();

  await page.getByRole("button", { name: "Confirmer la réservation" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "C'est réservé !" })).toBeVisible();
  await expect(page.getByText(/dans moins de 24 h/)).toHaveCount(0);
});

test("un lundi sans créneau est grisé et non cliquable ; « Retour » ramène à la prestation", async ({
  page,
}) => {
  const demandes = await mockSlots(page);
  await allerAuxCreneaux(page);

  const lundi = (await lastMonday(page))!;
  const radio = page.locator(`input[name="day"][value="${lundi}"]`);
  await expect(radio).toBeDisabled();
  await expect(radio).toHaveAccessibleName(/^lundi .*, aucun créneau disponible$/);
  // Toucher son libellé ne choisit rien et n'appelle pas la base.
  await radio.locator("xpath=ancestor::label[1]").click({ force: true });
  await expect(page.getByText("Choisis un jour pour voir les créneaux libres.")).toBeVisible();
  expect(demandes).not.toContain(lundi);
  await continuer(page);
  await expect(page.getByText("Choisis un jour, puis un créneau.")).toBeVisible();

  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Quelle prestation ?" })).toBeFocused();
});

/** Le dernier lundi du calendrier (toujours au-delà du délai de 2 h). */
async function lastMonday(page: Page): Promise<DayKey | undefined> {
  // Le calendrier s'affiche une fois les jours disponibles chargés : on l'attend.
  await expect(page.getByRole("radio", { name: /^lundi / }).first()).toBeAttached();
  const valeurs = await page
    .getByRole("radio", { name: /^lundi / })
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  return valeurs.at(-1);
}

test("erreur réseau sur les créneaux : message et « Réessayer »", async ({ page }) => {
  let echecs = 1;
  await mockSlots(page, (day) => (echecs-- > 0 ? "network-error" : { body: slotsFor(day) }));
  await allerAuxCreneaux(page);
  await toucherJour(page, firstDayWithSlots());

  await expect(page.getByRole("alert")).toContainText("Impossible de charger les créneaux");
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(groupeCreneaux(page).getByRole("radio")).toHaveCount(2);
});

test("créneau pris entre-temps : message clair et liste rechargée sans lui", async ({ page }) => {
  const day = firstDayWithSlots();
  const [first, second] = slotsFor(day);
  // Le premier créneau est « pris » au moment où le site tente de le réserver. (Pas de
  // compteur de lectures : en dev, React StrictMode lance les effets deux fois.)
  let pris = false;
  let lecturesApres = 0;
  const lectures = await mockSlots(page, () => {
    if (pris) lecturesApres++;
    return { body: pris ? [second] : [first, second] };
  });
  await mockRpc(page, "create_booking", () => {
    pris = true;
    return rpcError("slot_unavailable");
  });

  await allerAuRecap(page);
  await page.getByRole("button", { name: "Confirmer la réservation" }).click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Quel jour, quelle heure ?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ce créneau n'est plus disponible. Choisis-en un autre."),
  ).toBeVisible();
  await expect(groupeCreneaux(page).getByRole("radio")).toHaveCount(1);
  await expect(groupeCreneaux(page)).toContainText("15:10 – 16:10");
  // La liste a bien été relue en base après le refus.
  expect(lecturesApres).toBeGreaterThanOrEqual(1);
  expect(lectures.length).toBeGreaterThan(lecturesApres);
});

test("limite atteinte : message sobre ; réseau coupé : on peut réessayer", async ({ page }) => {
  await mockSlots(page);
  let reponse: RpcResponse = rpcError("limit_reached");
  await mockRpc(page, "create_booking", () => reponse);
  await allerAuRecap(page);

  const confirmer = page.getByRole("button", { name: "Confirmer la réservation" });
  await confirmer.click();
  const alerte = page.getByRole("alert");
  await expect(alerte).toContainText("Réservation impossible avec ces coordonnées");
  await expect(alerte).not.toContainText(/déjà 2|ce téléphone/);

  reponse = "network-error";
  await confirmer.click();
  await expect(alerte).toContainText("Vérifie ta connexion");
  await expect(confirmer).toBeEnabled();
});

test("coordonnées : champs à 16 px, zones tactiles de 44 px, honeypot hors écran", async ({
  page,
}) => {
  await mockSlots(page);
  await allerAuxCreneaux(page);
  await toucherJour(page, firstDayWithSlots());
  await groupeCreneaux(page).getByRole("radio").first().check();
  await continuer(page);
  await expect(page.getByRole("heading", { level: 2, name: "Tes coordonnées" })).toBeVisible();

  // Le piège à robots existe mais reste invisible et hors du parcours clavier.
  const honeypot = page.locator("#booking-website");
  await expect(honeypot).toHaveCount(1);
  await expect(honeypot).not.toBeInViewport();
  await expect(honeypot).toHaveAttribute("tabindex", "-1");

  const champs = page.locator("form input:not(#booking-website)");
  const mesures = await champs.evaluateAll((els) =>
    els.map((el) => {
      const cible = el.matches('[type="checkbox"], [type="radio"]') ? el.closest("label")! : el;
      return {
        name: el.getAttribute("name"),
        hauteur: cible.getBoundingClientRect().height,
        police: parseFloat(getComputedStyle(el).fontSize),
      };
    }),
  );
  expect(mesures.length).toBe(5);
  for (const { name, hauteur, police } of mesures) {
    expect(hauteur, `zone tactile de ${name}`).toBeGreaterThanOrEqual(44);
    expect(police, `taille du texte de ${name}`).toBeGreaterThanOrEqual(16);
  }
  await expect(page.getByLabel("Téléphone")).toHaveAttribute("type", "tel");
  await expect(page.getByLabel("Email")).toHaveAttribute("type", "email");
});

/**
 * Faux presse-papiers, installé avant le chargement de la page : on vérifie ce que NOTRE code
 * copie, de la même façon dans Chromium et WebKit (lire le vrai presse-papiers depuis un test
 * n'est possible que dans Chromium, avec une permission).
 */
async function simulerPressePapiers(page: Page, { refuse }: { refuse: boolean }) {
  await page.addInitScript((refuser) => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (texte: string) => {
          if (refuser) throw new DOMException("refusé", "NotAllowedError");
          (window as unknown as { __copie: string }).__copie = texte;
        },
      },
    });
  }, refuse);
}

test("confirmation : « Ouvrir ma page d'annulation » garde le jeton dans le fragment", async ({
  page,
}) => {
  const lectures: unknown[] = [];
  await reserverJusquALaConfirmation(page);
  const [creneau] = slotsFor(firstDayWithSlots());
  await mockRpc(page, "get_booking", (args) => {
    lectures.push(args);
    return {
      body: [
        {
          status: "confirmed",
          starts_at: creneau!.starts_at,
          ends_at: creneau!.ends_at,
          service_name: "Coupe",
          location_label: creneau!.location_label,
          first_name: "Zoé",
          can_cancel: true,
          cancelled_by: null,
        },
      ],
    };
  });

  await page.getByRole("link", { name: "Ouvrir ma page d'annulation" }).click();

  await expect(page).toHaveURL(new RegExp(`/annuler#${TOKEN}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Zoé, ton rendez-vous" })).toBeVisible();
  // Le jeton est lu dans le fragment et envoyé dans le corps de la requête, jamais dans l'URL.
  expect(lectures.length).toBeGreaterThanOrEqual(1);
  expect(
    lectures.every((args) => JSON.stringify(args) === JSON.stringify({ p_token: TOKEN })),
  ).toBe(true);
});

test("confirmation : « Copier le lien » copie le lien d'annulation", async ({ page }) => {
  await simulerPressePapiers(page, { refuse: false });
  await reserverJusquALaConfirmation(page);

  // Pas d'e-mail : la page invite à garder le lien ou à faire une capture d'écran.
  await expect(page.getByText(/pas d'e-mail de confirmation/)).toBeVisible();
  await expect(page.getByText(/capture d'écran/).first()).toBeVisible();

  const bouton = page.getByRole("button", { name: "Copier le lien" });
  expect((await bouton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await bouton.click();

  await expect(page.getByRole("status").filter({ hasText: "Lien copié." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lien copié" })).toBeVisible();
  const lienAffiche = await page.locator("#cancel-link-url").textContent();
  const copie = await page.evaluate(() => (window as unknown as { __copie: string }).__copie);
  expect(copie).toBe(`http://localhost:5173/annuler#${TOKEN}`);
  expect(copie).toBe(lienAffiche?.trim());
});

test("confirmation : si la copie est refusée, la page propose de copier à la main", async ({
  page,
}) => {
  await simulerPressePapiers(page, { refuse: true });
  await reserverJusquALaConfirmation(page);

  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Copie impossible/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copier le lien" })).toBeVisible();
});

/**
 * Bug corrigé : sur téléphone, en http://192.168.x.x:5173 (contexte NON sécurisé), les API
 * réservées à https / localhost n'existent pas. On les retire avant le chargement de la page
 * pour reproduire ce contexte dans Chromium (Android) et WebKit (iPhone).
 */
test("contexte non sécurisé (http) : prestations, réservation et repli de la copie", async ({
  page,
}) => {
  await page.addInitScript(() => {
    delete (Crypto.prototype as { randomUUID?: unknown }).randomUUID;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  const erreurs: string[] = [];
  page.on("pageerror", (e) => erreurs.push(e.message));

  await page.goto("/reserver");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await expect(page.getByRole("radio", { name: /^Coupe\s*60 min/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Coupe \+ barbe/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await reserverJusquALaConfirmation(page);
  await expect(page.locator("#cancel-link-url")).toHaveText(new RegExp(`/annuler#${TOKEN}$`));
  await page.getByRole("button", { name: "Copier le lien" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Copie impossible/ })).toBeVisible();
  expect(erreurs).toEqual([]);
});
