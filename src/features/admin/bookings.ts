import type { AdminBooking, CancelledBy } from "@/features/admin/data";
import { addDaysToKey, parisDayKey, type DayKey } from "@/lib/dates";

/**
 * Logique pure des écrans « Rendez-vous » de l'admin (aucun appel réseau) : regroupement par
 * jour à Paris, compteur, droit d'annuler, formats de contact. `now` est toujours passé en
 * paramètre : les tests figent la date sans toucher à l'horloge du système.
 */

export type BookingDay = {
  day: DayKey;
  isToday: boolean;
  bookings: AdminBooking[];
};

/**
 * Regroupe les rendez-vous par jour (heure de Paris), dans l'ordre reçu de la base
 * (chronologique pour « À venir », du plus récent au plus ancien pour « Passées »).
 */
export function groupByParisDay(bookings: AdminBooking[], now: Date): BookingDay[] {
  const today = parisDayKey(now);
  const groups: BookingDay[] = [];
  for (const booking of bookings) {
    const day = parisDayKey(booking.startsAt);
    const last = groups.at(-1);
    if (last?.day === day) last.bookings.push(booking);
    else groups.push({ day, isToday: day === today, bookings: [booking] });
  }
  return groups;
}

/** Nombre de rendez-vous confirmés (les annulés restent affichés mais ne comptent pas). */
export function countConfirmed(bookings: AdminBooking[]): number {
  return bookings.filter((b) => b.status === "confirmed").length;
}

/**
 * Alix peut annuler un rendez-vous confirmé qui n'a pas commencé, sans délai de 24 h. La base
 * applique la même règle (`already_started`) : ceci ne sert qu'à afficher ou non le bouton.
 */
export function canBarberCancel(booking: Pick<AdminBooking, "status" | "startsAt">, now: Date) {
  return booking.status === "confirmed" && Date.parse(booking.startsAt) > now.getTime();
}

/**
 * Tableau de bord : rendez-vous confirmés d'aujourd'hui, puis des `days` jours suivants (jours
 * calendaires de Paris). La liste reçue est celle de « À venir », déjà chronologique.
 */
export function splitForDashboard(
  bookings: AdminBooking[],
  now: Date,
  days: number,
): { today: AdminBooking[]; upcoming: AdminBooking[] } {
  const today = parisDayKey(now);
  const lastDay = addDaysToKey(today, days);
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  return {
    today: confirmed.filter((b) => parisDayKey(b.startsAt) === today),
    upcoming: confirmed.filter((b) => {
      const day = parisDayKey(b.startsAt);
      return day > today && day <= lastDay;
    }),
  };
}

/** État d'annulation écrit en toutes lettres : jamais signalé par la seule couleur. */
export function cancelledLabel(cancelledBy: CancelledBy | null): string {
  return cancelledBy === "barber" ? "Annulé par toi" : "Annulé par le client";
}

/**
 * Lien `mailto:` sûr. La base accepte `?`, `&`, `=` ou `%` dans un e-mail : sans
 * échappement, un faux client pourrait glisser `?cc=…&body=…` et ajouter un destinataire ou
 * un texte au message qu'Alix croit écrire au client. Chaque partie est donc encodée.
 */
export function mailtoHref(email: string): string {
  const at = email.lastIndexOf("@");
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${encodeURIComponent(email.slice(at + 1))}`;
}

/** « 0612345678 » → « 06 12 34 56 78 » ; les numéros internationaux restent tels quels. */
export function formatPhone(phone: string): string {
  return /^0\d{9}$/.test(phone) ? phone.replace(/(\d{2})(?=\d)/g, "$1 ") : phone;
}

/**
 * « 3 rendez-vous confirmés à venir », « Aucun rendez-vous confirmé à venir ». Le mot
 * « confirmé » évite la contradiction avec les RDV annulés, affichés dans la même liste.
 */
export function describeCount(count: number, suffix: string): string {
  if (count === 0) return `Aucun rendez-vous confirmé ${suffix}`;
  return `${count} rendez-vous ${count > 1 ? "confirmés" : "confirmé"} ${suffix}`;
}
