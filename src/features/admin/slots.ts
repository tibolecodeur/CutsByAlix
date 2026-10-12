import {
  addDaysToKey,
  formatTime,
  isoWeekday,
  parisDateTime,
  parisDayKey,
  type DayKey,
} from "@/lib/dates";

/**
 * Calculs de l'écran « Disponibilités » (aperçu en direct, période réservable, liste par
 * semaine). Logique pure, sans React ni réseau.
 *
 * Les valeurs (70 min, 2 h, 28 jours) ne sont JAMAIS écrites ici : elles arrivent de la base
 * (`admin_booking_rules`, lue dans `private.settings()`). La base reste seule juge : ces calculs
 * ne servent qu'à prévenir Alix avant l'envoi.
 */

/** Règles renvoyées par la RPC `admin_booking_rules`. */
export type BookingRules = {
  /** Pas de la grille ET longueur d'un créneau, en minutes. */
  slotStepMin: number;
  /** Un créneau n'est plus proposé à moins de X minutes de son début. */
  minNoticeMin: number;
  /** Un créneau n'est proposé qu'à partir de X jours calendaires (heure de Paris) avant. */
  maxAdvanceDays: number;
};

const MINUTE_MS = 60_000;

/**
 * Débuts des créneaux d'une plage : grille au pas `stepMin` depuis le début, un créneau compte
 * s'il tient entièrement. Même calcul que `private.availability_slot_count` : on avance en
 * temps ABSOLU (comme `generate_series` sur un timestamptz), donc pas de doublon ni de trou au
 * changement d'heure.
 */
export function slotStarts(startsAt: Date, endsAt: Date, stepMin: number): Date[] {
  const step = stepMin * MINUTE_MS;
  if (!(step > 0)) return [];
  const starts: Date[] = [];
  for (let t = startsAt.getTime(); t + step <= endsAt.getTime(); t += step) {
    starts.push(new Date(t));
  }
  return starts;
}

/** « 3 créneaux : 10:00, 11:10, 12:20 » (heures de Paris). */
export function describeSlots(starts: Date[]): string {
  if (starts.length === 0) return "Aucun créneau";
  const label = starts.length === 1 ? "1 créneau" : `${starts.length} créneaux`;
  return `${label} : ${starts.map((s) => formatTime(s)).join(", ")}`;
}

/**
 * Instant où un créneau entre dans l'horizon de réservation : même heure de Paris,
 * `maxAdvanceDays` jours calendaires plus tôt. Miroir de `private.max_booking_time`, qui ajoute
 * des jours à l'heure LOCALE de Paris (4 semaines restent 4 semaines au changement d'heure).
 */
export function opensAt(slotStart: Date, maxAdvanceDays: number): Date {
  const day = addDaysToKey(parisDayKey(slotStart), -maxAdvanceDays);
  return parisDateTime(day, formatTime(slotStart));
}

export type BookableWindow =
  /** Plage sans créneau, ou dont tous les créneaux sont déjà à moins du délai minimum. */
  | { status: "never" }
  | {
      status: "bookable";
      /** Ouverture (null : déjà ouverte, réservable dès maintenant). */
      from: Date | null;
      /** Fermeture : dernier créneau moins le délai minimum. */
      until: Date;
      /** Créneaux déjà trop proches, qui ne seront jamais proposés. */
      tooSoonCount: number;
    };

/**
 * Période pendant laquelle les clients peuvent réserver au moins un créneau de la plage.
 * Un créneau est proposé entre `opensAt` (horizon) et son début moins `minNoticeMin`.
 */
export function bookableWindow(starts: Date[], rules: BookingRules, now: Date): BookableWindow {
  const notice = rules.minNoticeMin * MINUTE_MS;
  // `>=` comme `private.compute_slots` : à 2 h pile, le créneau est encore proposé.
  const stillBookable = starts.filter((s) => s.getTime() - notice >= now.getTime());
  const first = stillBookable[0];
  const last = stillBookable.at(-1);
  if (!first || !last) return { status: "never" };

  const opening = opensAt(first, rules.maxAdvanceDays);
  return {
    status: "bookable",
    from: opening.getTime() > now.getTime() ? opening : null,
    until: new Date(last.getTime() - notice),
    tooSoonCount: starts.length - stillBookable.length,
  };
}

/** « 2 h », « 90 min » : un délai en minutes, lisible. */
export function formatDelay(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

export type WeekGroup<T> = {
  /** Lundi de la semaine (jour calendaire de Paris). */
  monday: DayKey;
  items: T[];
};

/** Regroupe par semaine (lundi → dimanche, heure de Paris), dans l'ordre reçu. */
export function groupByParisWeek<T extends { startsAt: string }>(items: T[]): WeekGroup<T>[] {
  const groups: WeekGroup<T>[] = [];
  for (const item of items) {
    const day = parisDayKey(item.startsAt);
    const monday = addDaysToKey(day, 1 - isoWeekday(day));
    const group = groups.find((g) => g.monday === monday);
    if (group) group.items.push(item);
    else groups.push({ monday, items: [item] });
  }
  return groups;
}
