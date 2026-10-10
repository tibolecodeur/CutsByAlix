import { BOOKING_RULES, HOUR_MS } from "@/lib/bookingRules";
import { parisDayKey, type DayKey } from "@/lib/dates";

/**
 * Délai minimum (48 h) côté affichage. La base fait foi (create_booking refuse « too_soon ») :
 * ces fonctions servent seulement à EXPLIQUER au client pourquoi un jour est vide.
 */

/**
 * Premier jour (à Paris) qui peut encore avoir des créneaux : celui où tombe « maintenant +
 * 48 h ». Délai en heures absolues, comme en base : 48 h restent 48 h au changement d'heure.
 */
export function firstBookableDay(now: Date): DayKey {
  return parisDayKey(new Date(now.getTime() + BOOKING_RULES.minNoticeHours * HOUR_MS));
}

/** Vrai si ce jour est entièrement à moins de 48 h : aucun créneau ne peut y être proposé. */
export function isTooSoonDay(day: DayKey, now: Date): boolean {
  // Les jours ISO « yyyy-MM-dd » se comparent comme des chaînes.
  return day < firstBookableDay(now);
}
