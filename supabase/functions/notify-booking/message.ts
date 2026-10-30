/**
 * Texte de la notification envoyée à Alix (logique pure, testée par Vitest).
 *
 * Écran verrouillé de l'iPhone (consigne du 2026-10-30) :
 *   Nouvelle réservation
 *   Jeudi 30 octobre · 14:00
 *   Kevin · Coupe + barbe
 * Rien d'autre : ni nom de famille, ni téléphone, ni e-mail.
 */

export type BookingEventKind = "new_booking" | "cancelled" | "test";

export type BookingSummary = {
  id: string;
  startsAt: string;
  firstName: string;
  serviceName: string;
};

export type PushMessage = {
  title: string;
  body: string;
  /** Page ouverte au toucher de la notification (dans l'espace admin). */
  url: string;
  /** Même tag = la notification remplace la précédente au lieu de s'empiler. */
  tag: string;
};

const TITLES: Record<Exclude<BookingEventKind, "test">, string> = {
  new_booking: "Nouvelle réservation",
  cancelled: "Réservation annulée",
};

/** Au-delà, le prénom est coupé : la deuxième ligne doit tenir sur l'écran verrouillé. */
const MAX_FIRST_NAME = 24;

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

/** « Jeudi 30 octobre · 14:00 », à l'heure de Paris (comme sur le site). */
export function formatWhen(startsAt: string): string {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_date");
  const day = dayFormatter.format(date);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${timeFormatter.format(date)}`;
}

function shortFirstName(firstName: string): string {
  const trimmed = firstName.trim();
  return trimmed.length > MAX_FIRST_NAME ? `${trimmed.slice(0, MAX_FIRST_NAME - 1)}…` : trimmed;
}

export function buildBookingMessage(
  kind: Exclude<BookingEventKind, "test">,
  booking: BookingSummary,
): PushMessage {
  const who = [shortFirstName(booking.firstName), booking.serviceName.trim()]
    .filter(Boolean)
    .join(" · ");
  return {
    title: TITLES[kind],
    body: `${formatWhen(booking.startsAt)}\n${who}`,
    url: `/admin/rendez-vous/${booking.id}`,
    tag: `${kind}-${booking.id}`,
  };
}

export function buildTestMessage(): PushMessage {
  return {
    title: "Notifications activées",
    body: "Tu recevras une notification à chaque nouvelle réservation et à chaque annulation.",
    url: "/admin",
    tag: "test",
  };
}
