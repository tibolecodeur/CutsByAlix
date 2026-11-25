import { parisDayKey } from "@/lib/dates";

/**
 * Période des décorations de Noël, à Paris : du 1er décembre au 6 janvier inclus
 * (décision du 2026-11-25, docs/DESIGN.md). Comparaison sur le « mois-jour » du jour à Paris :
 * « 12-01 » ≤ jour, ou jour ≤ « 01-06 » (la période chevauche le changement d'année).
 */
export function isChristmasSeason(now: Date): boolean {
  const monthDay = parisDayKey(now).slice(5); // « yyyy-MM-dd » → « MM-dd »
  return monthDay >= "12-01" || monthDay <= "01-06";
}

/**
 * Bonnet de Noël sur le « C » du logo (accueil). Interrupteur MANUEL, indépendant de la
 * période : mettre `false` pour le retirer après les fêtes.
 */
export const SHOW_CHRISTMAS_HAT = true;
