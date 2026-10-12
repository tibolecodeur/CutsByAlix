import type { AvailableDay } from "@/features/booking/data";
import { BOOKING_RULES } from "@/lib/bookingRules";
import { addDaysToKey, formatDayKey, parisDayKey, type DayKey } from "@/lib/dates";

/**
 * Logique du calendrier de /reserver : quels jours proposer, lesquels sont disponibles, et
 * comment les annoncer. Fonctions pures, sans réseau, donc testables.
 *
 * Les jours viennent de la base (`get_available_days`) déjà en heure de Paris, sous forme de
 * chaînes « yyyy-MM-dd » : le navigateur ne regroupe rien et ne convertit aucun fuseau. Il se
 * contente de les comparer comme des chaînes.
 */

/** Les jours affichés : aujourd'hui (à Paris) et les suivants, `maxAdvanceDays` au total. */
export function calendarDays(now: Date): DayKey[] {
  const today = parisDayKey(now);
  return Array.from({ length: BOOKING_RULES.maxAdvanceDays }, (_, i) => addDaysToKey(today, i));
}

/**
 * Nombre de créneaux par jour. Un jour absent de la liste n'a aucun créneau : passé, hors de la
 * période de réservation, à moins de 2 h, entièrement pris, ou sans plage publiée.
 */
export function countByDay(days: readonly AvailableDay[]): ReadonlyMap<DayKey, number> {
  return new Map(days.map((d) => [d.day, d.slotCount]));
}

/** Vrai si au moins un des jours affichés a un créneau. */
export function hasAvailableDay(shown: readonly DayKey[], counts: ReadonlyMap<DayKey, number>) {
  return shown.some((day) => (counts.get(day) ?? 0) > 0);
}

/**
 * Nom accessible d'un jour du calendrier : « mardi 13 octobre, 3 créneaux disponibles ».
 * `count` à `undefined` = disponibilité inconnue (chargement impossible) : on ne dit rien de plus.
 */
export function dayLabel(day: DayKey, count: number | undefined): string {
  const name = formatDayKey(day);
  if (count === undefined) return name;
  if (count <= 0) return `${name}, aucun créneau disponible`;
  return `${name}, ${count} ${count === 1 ? "créneau disponible" : "créneaux disponibles"}`;
}
