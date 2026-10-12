/**
 * Règles de réservation, COPIE de `private.settings()` (supabase/migrations) qui fait foi.
 * Le front s'en sert pour ses textes (« annulation jusqu'à 24 h avant ») et la fausse base
 * pour imiter le serveur. Si une valeur change en base, la changer ici aussi.
 */
export const BOOKING_RULES = {
  /** Pas de la grille de créneaux, depuis le début de chaque disponibilité. */
  slotStepMinutes: 70,
  /** Délai minimum entre maintenant et le début du RDV. */
  minNoticeHours: 2,
  /** Horizon de réservation. */
  maxAdvanceDays: 28,
  /** Annulation client possible jusqu'à X heures avant le RDV. */
  cancelNoticeHours: 24,
  /** RDV futurs maximum par téléphone ou par email. */
  maxFutureBookings: 2,
} as const;

export const HOUR_MS = 60 * 60 * 1000;
