import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  addDaysToKey,
  formatDayKey,
  parisDateTime,
  parisDayKey,
  type DayKey,
} from "../src/lib/dates.ts";
import { expect, mockRpc, test } from "./fixtures.ts";

/**
 * Calendrier de /reserver : jours sans créneau grisés (Android, iPhone, desktop). Supabase est
 * simulé : get_available_days (les jours qui ont des créneaux, en UNE requête) et
 * get_available_slots (les créneaux du jour touché). Aucune requête n'atteint une vraie base.
 */

const PONTS_DE_CE = "a11ce000-0000-4000-8000-000000000101";

/** Jour du calendrier à `offset` jours d'aujourd'hui (Paris). */
const dayAt = (offset: number): DayKey => addDaysToKey(parisDayKey(new Date()), offset);

function slotRows(day: DayKey, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const start = `${String(14 + i).padStart(2, "0")}:00`;
    const end = `${String(15 + i).padStart(2, "0")}:00`;
    return {
      starts_at: parisDateTime(day, start).toISOString(),
      ends_at: parisDateTime(day, end).toISOString(),
      location_id: PONTS_DE_CE,
      location_label: "Les Ponts-de-Cé",
    };
  });
}

/** Simule les jours disponibles ; renvoie le nombre d'appels à get_available_days. */
async function mockDays(page: Page, days: { day: DayKey; slot_count: number }[]) {
  const calls = { days: 0, slots: [] as string[] };
  await mockRpc(page, "get_available_days", () => {
    calls.days++;
    return { body: days };
  });
  await mockRpc(page, "get_available_slots", (args) => {
    const day = String(args.p_day);
    calls.slots.push(day);
    const found = days.find((d) => d.day === day);
    return { body: found ? slotRows(day, found.slot_count) : [] };
  });
  return calls;
}

/** Ouvre l'étape « jour et créneau » (prestation « Coupe »). */
async function openCalendar(page: Page) {
  await page.goto("/reserver");
  await page
    .getByRole("radio", { name: /^Coupe/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Quel jour, quelle heure ?" }),
  ).toBeVisible();
}

const radioOf = (page: Page, day: DayKey) => page.locator(`input[name="day"][value="${day}"]`);

async function expectNoAxeViolation(page: Page) {
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
}

test("jour grisé : non cliquable et annoncé ; jour disponible : cliquable, avec ses créneaux", async ({
  page,
}) => {
  const calls = await mockDays(page, [
    { day: dayAt(3), slot_count: 2 },
    { day: dayAt(5), slot_count: 1 },
  ]);
  await openCalendar(page);

  // Disponible : actif, avec le nombre de créneaux dans son nom accessible, contour plein.
  const dispo = radioOf(page, dayAt(3));
  await expect(dispo).toBeEnabled();
  await expect(dispo).toHaveAccessibleName(`${formatDayKey(dayAt(3))}, 2 créneaux disponibles`);
  await expect(radioOf(page, dayAt(5))).toHaveAccessibleName(
    `${formatDayKey(dayAt(5))}, 1 créneau disponible`,
  );
  await expect(dispo.locator("xpath=ancestor::label[1]")).not.toHaveCSS(
    "text-decoration-line",
    "line-through",
  );

  // Sans créneau : désactivé, annoncé, barré.
  const grise = radioOf(page, dayAt(4));
  await expect(grise).toBeDisabled();
  await expect(grise).toHaveAccessibleName(`${formatDayKey(dayAt(4))}, aucun créneau disponible`);
  const caseGrise = grise.locator("xpath=ancestor::label[1]");
  await expect(caseGrise).toHaveCSS("text-decoration-line", "line-through");

  // Toucher le jour grisé ne choisit rien et n'appelle pas la base.
  await caseGrise.click({ force: true });
  await expect(grise).not.toBeChecked();
  await expect(page.getByText("Choisis un jour pour voir les créneaux libres.")).toBeVisible();
  expect(calls.slots).toEqual([]);

  // Toucher le jour disponible affiche ses créneaux.
  await dispo.locator("xpath=ancestor::label[1]").click();
  await expect(dispo).toBeChecked();
  await expect(
    page.getByRole("group", { name: /^Créneaux libres/ }).getByRole("radio"),
  ).toHaveCount(2);
  expect(calls.slots).toEqual([dayAt(3)]);

  // Tous les jours viennent d'UNE seule requête, pas d'une par jour.
  expect(calls.days).toBe(1);
  await expectNoAxeViolation(page);
});

test("zones tactiles de 44 px pour les jours, grisés comme disponibles", async ({ page }) => {
  await mockDays(page, [{ day: dayAt(3), slot_count: 1 }]);
  await openCalendar(page);
  for (const day of [dayAt(3), dayAt(4)]) {
    const box = await radioOf(page, day).locator("xpath=ancestor::label[1]").boundingBox();
    expect(box!.height, `jour ${day}`).toBeGreaterThanOrEqual(44);
  }
});

test("aucun jour disponible : message clair avec le lien Instagram, sans « Continuer »", async ({
  page,
}) => {
  await mockDays(page, []);
  await openCalendar(page);

  await expect(
    page.getByText("Aucun créneau disponible pour le moment, contacte Alix sur Instagram."),
  ).toBeVisible();
  const lien = page.getByRole("link", { name: /@CutsByAlix sur Instagram/ });
  await expect(lien).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
  await expect(lien).toHaveAttribute("target", "_blank");
  expect(((await lien.getAttribute("rel")) ?? "").split(" ")).toEqual(
    expect.arrayContaining(["noopener", "noreferrer"]),
  );
  await expect(page.locator('input[name="day"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continuer" })).toHaveCount(0);
  await expectNoAxeViolation(page);

  // Retour à la prestation.
  await page.getByRole("button", { name: "Retour" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Quelle prestation ?" })).toBeFocused();
});

test("clavier : les flèches sautent les jours grisés et le focus n'est jamais piégé", async ({
  page,
}) => {
  const calls = await mockDays(page, [
    { day: dayAt(2), slot_count: 1 },
    { day: dayAt(4), slot_count: 1 },
  ]);
  await openCalendar(page);
  const premier = radioOf(page, dayAt(2));
  const grise = radioOf(page, dayAt(3));
  const second = radioOf(page, dayAt(4));

  // Un jour grisé ne peut pas recevoir le focus.
  await grise.focus();
  await expect(grise).not.toBeFocused();

  // Flèche droite : du premier jour disponible au suivant, en sautant le grisé.
  await premier.focus();
  await expect(premier).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(second).toBeFocused();
  await expect(second).toBeChecked();
  await expect(grise).not.toBeChecked();
  await expect(page.getByRole("group", { name: /^Créneaux libres/ })).toBeVisible();
  expect(calls.slots).toContain(dayAt(4));

  // Pas de piège : la flèche gauche revient au premier jour disponible, en sautant le grisé.
  // (À la fin du groupe, la flèche droite boucle sous Chromium et reste en place sous WebKit :
  // comportement natif des boutons radio de chaque moteur, sans rapport avec le calendrier.)
  await page.keyboard.press("ArrowLeft");
  await expect(premier).toBeFocused();
  await expect(grise).not.toBeFocused();

  // Et Tab sort du calendrier : le focus quitte les jours, il n'y reste pas enfermé.
  await page.keyboard.press("Tab");
  await expect(page.locator('input[name="day"]:focus')).toHaveCount(0);
});

test("jours impossibles à charger : message, calendrier utilisable, « Réessayer » applique le grisé", async ({
  page,
}) => {
  let echecs = 1;
  await mockRpc(page, "get_available_days", () =>
    echecs-- > 0 ? "network-error" : { body: [{ day: dayAt(3), slot_count: 1 }] },
  );
  await mockRpc(page, "get_available_slots", (args) => ({
    body: slotRows(String(args.p_day), 1),
  }));
  await openCalendar(page);

  await expect(page.getByRole("alert")).toContainText(
    "Impossible de vérifier les jours disponibles",
  );
  // Tous les jours restent utilisables, sans rien annoncer de faux.
  await expect(radioOf(page, dayAt(4))).toBeEnabled();
  await expect(radioOf(page, dayAt(4))).toHaveAccessibleName(formatDayKey(dayAt(4)));

  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(radioOf(page, dayAt(4))).toBeDisabled();
  await expect(radioOf(page, dayAt(3))).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
