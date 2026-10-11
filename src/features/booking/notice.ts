import { BOOKING_RULES, HOUR_MS } from "@/lib/bookingRules";
import { parisDayKey, type DayKey } from "@/lib/dates";

/**
 * Délai minimum (5 h) côté affichage. La base fait foi (create_booking refuse « too_soon ») :
 * ces fonctions servent seulement à EXPLIQUER au client pourquoi un jour est vide.
 */

/**
 * Premier jour (à Paris) qui peut encore avoir des créneaux : celui où tombe « maintenant +
 * 5 h ». Délai en heures absolues, comme en base : 5 h restent 5 h au changement d'heure.
 */
export function firstBookableDay(now: Date): DayKey {
  return parisDayKey(new Date(now.getTime() + BOOKING_RULES.minNoticeHours * HOUR_MS));
}

/**
 * Vrai si le RDV commence dans MOINS de 24 h : le client ne pourra pas l'annuler en ligne.
 * Simple avertissement d'affichage (horloge du navigateur) : la base applique la vraie règle
 * (`cancel_booking` refuse « too_late »). Même bord que la base : à 24 h pile, on peut encore
 * annuler.
 */
export function isWithinCancelNotice(startsAt: string, now: Date): boolean {
  return new Date(startsAt).getTime() - now.getTime() < BOOKING_RULES.cancelNoticeHours * HOUR_MS;
}

/** Vrai si ce jour est entièrement à moins de 5 h : aucun créneau ne peut y être proposé. */
export function isTooSoonDay(day: DayKey, now: Date): boolean {
  // Les jours ISO « yyyy-MM-dd » se comparent comme des chaînes.
  return day < firstBookableDay(now);
}
