import { BOOKING_RULES, HOUR_MS } from "@/lib/bookingRules";
import type { DayKey } from "@/lib/dates";
import { fakeDb, fakeLatency, syncFakeServices } from "@/lib/fakeDb";
import { getSupabase } from "@/lib/supabase";

/**
 * Couche données de la réservation : les écrans n'importent QUE ces fonctions.
 * Chaque fonction a la forme de la table ou de la RPC Supabase correspondante
 * (supabase/migrations/…_reservation_reelle.sql), avec des noms en camelCase.
 *
 * Branché sur Supabase : `getServices`, `getAvailableSlots`, `createBooking`.
 * TODO: brancher Supabase. `getBooking` et `cancelBooking` sont encore factices
 * (src/lib/fakeDb.ts) : remplacer chaque corps par l'appel `getSupabase().rpc(…)`.
 */

/** Table `services`. */
export type Service = {
  id: string;
  name: string;
  durationMin: number;
  /** Prix affiché tel quel (« 15 € ») ; null tant qu'il n'est pas fixé. */
  priceLabel: string | null;
};

/**
 * Ligne renvoyée par la RPC `get_available_slots` : chaque créneau porte son lieu, fixé par le
 * barber dans sa disponibilité. Le client choisit un créneau, jamais un lieu.
 * Libellé public uniquement : l'adresse privée n'est jamais renvoyée ici.
 */
export type AvailableSlot = {
  startsAt: string;
  endsAt: string;
  locationId: string;
  locationLabel: string;
};

/** Paramètres de la RPC `create_booking`. */
export type NewBooking = {
  serviceId: string;
  startsAt: string;
  /** Lieu du créneau choisi : la base vérifie qu'il correspond toujours à la disponibilité. */
  locationId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  /** Honeypot : champ invisible, rempli seulement par les robots. */
  website?: string;
};

/**
 * Ligne renvoyée par la RPC `create_booking` : le récapitulatif. Pas d'adresse privée : la
 * règle de révélation reste à décider (docs/PLAN.md).
 */
export type BookingReceipt = {
  startsAt: string;
  endsAt: string;
  serviceName: string;
  locationLabel: string;
  /** Seul moyen d'annuler : renvoyé une seule fois, jamais journalisé. */
  cancelToken: string;
};

/** Ligne renvoyée par la RPC `get_booking` (ni adresse, ni téléphone, ni email). */
export type BookingDetails = {
  status: "confirmed" | "cancelled";
  startsAt: string;
  endsAt: string;
  serviceName: string;
  locationLabel: string;
  firstName: string;
  canCancel: boolean;
};

/** Clés d'erreur stables renvoyées par les RPC (exceptions P0001), plus « unknown » (réseau…). */
export type BookingErrorCode =
  | "invalid_input"
  | "slot_unavailable"
  | "too_soon"
  | "too_far"
  | "limit_reached"
  | "too_late"
  | "unknown";

const RPC_ERROR_CODES: readonly BookingErrorCode[] = [
  "invalid_input",
  "slot_unavailable",
  "too_soon",
  "too_far",
  "limit_reached",
  "too_late",
];

export class BookingError extends Error {
  readonly code: BookingErrorCode;

  constructor(code: BookingErrorCode) {
    super(code);
    this.name = "BookingError";
    this.code = code;
  }
}

/**
 * Traduit l'erreur d'une RPC en `BookingError`. Seules les exceptions métier (code SQL P0001,
 * message = clé connue) gardent leur clé ; tout le reste (réseau, panne, config) devient
 * « unknown ». Le message d'origine n'est PAS recopié : il pourrait contenir des données.
 */
function toBookingError(error: { code?: string; message: string }): BookingError {
  const code = RPC_ERROR_CODES.find((known) => known === error.message);
  return new BookingError(error.code === "P0001" && code ? code : "unknown");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Vrai si la chaîne a la forme d'un uuid. À vérifier AVANT d'appeler la base : Postgres
 * répondrait par une erreur de syntaxe, qu'on afficherait à tort comme une panne.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Au-delà, on abandonne la requête : en 4G instable, mieux vaut « Réessayer » qu'un chargement sans fin. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Prestations actives, dans l'ordre d'affichage : lecture de la vraie table `services`.
 * Pas de filtre `active` ici : la RLS (policy `services_public_read`) ne montre que les
 * prestations actives à l'anonyme, qui n'a d'ailleurs le droit de lire QUE les colonnes
 * id, name, duration_min, price_label et sort_order (migration regles_reservation…).
 * Rejette en cas d'erreur réseau, de base ou de config manquante.
 */
export async function getServices(): Promise<Service[]> {
  const { data, error } = await getSupabase()
    .from("services")
    .select("id, name, duration_min, price_label")
    .order("sort_order")
    .order("name")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw new Error(`Lecture des prestations impossible : ${error.message}`);

  const services = data.map((s) => ({
    id: s.id,
    name: s.name,
    durationMin: s.duration_min,
    priceLabel: s.price_label,
  }));
  // TODO: brancher Supabase. À retirer avec la fausse base (annulation encore factice).
  syncFakeServices(data);
  return services;
}

/**
 * RPC `get_available_slots(p_service_id, p_day)` : créneaux libres d'un jour (heure de Paris),
 * déjà filtrés par la base (lieux actifs, au moins 48 h, au plus 4 semaines, grille de 70 min,
 * créneaux pris retirés). Rejette en cas d'erreur réseau, de base ou de config manquante.
 */
export async function getAvailableSlots(serviceId: string, day: DayKey): Promise<AvailableSlot[]> {
  const { data, error } = await getSupabase()
    .rpc("get_available_slots", { p_service_id: serviceId, p_day: day })
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw new Error(`Lecture des créneaux impossible : ${error.message}`);

  return data.map((slot) => ({
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    locationId: slot.location_id,
    locationLabel: slot.location_label,
  }));
}

/**
 * RPC `create_booking` : crée le RDV et renvoie le récap avec le lien d'annulation.
 * Toutes les règles sont vérifiées par la base ; une erreur devient une `BookingError`.
 *
 * Volontairement SANS délai d'abandon : couper la requête côté navigateur n'annule pas
 * l'insertion côté base. Le RDV serait créé, mais le client aurait perdu son seul lien
 * d'annulation. On laisse le navigateur aller au bout (ou échouer de lui-même).
 */
export async function createBooking(input: NewBooking): Promise<BookingReceipt> {
  let response;
  try {
    response = await getSupabase().rpc("create_booking", {
      p_service_id: input.serviceId,
      p_starts_at: input.startsAt,
      p_location_id: input.locationId,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_phone: input.phone?.trim() || null,
      p_email: input.email?.trim() || null,
      p_website: input.website || null,
    });
  } catch {
    // Config manquante (SupabaseConfigError) ou erreur inattendue du client.
    throw new BookingError("unknown");
  }

  const { data, error } = response;
  if (error) throw toBookingError(error);
  const row = data[0];
  if (!row) throw new BookingError("unknown");
  return {
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName: row.service_name,
    locationLabel: row.location_label,
    cancelToken: row.cancel_token,
  };
}

/** RPC `get_booking(p_token)` : null si le lien est invalide (rien d'autre ne fuit). */
export async function getBooking(token: string): Promise<BookingDetails | null> {
  if (!isUuid(token)) return null;
  await fakeLatency();
  const db = fakeDb();
  const booking = db.bookings.find((b) => b.cancel_token === token.toLowerCase());
  if (!booking) return null;

  const now = Date.now();
  const service = db.services.find((s) => s.id === booking.service_id)!;
  const location = db.locations.find((l) => l.id === booking.location_id)!;
  const isConfirmed = booking.status === "confirmed";
  return {
    status: booking.status,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    serviceName: service.name,
    locationLabel: location.public_label,
    firstName: booking.first_name,
    canCancel:
      isConfirmed &&
      now <= Date.parse(booking.starts_at) - BOOKING_RULES.cancelNoticeHours * HOUR_MS,
  };
}

/**
 * RPC `cancel_booking(p_token)` : true si annulé ; false si lien inconnu ou RDV déjà annulé ;
 * erreur `too_late` à moins de 24 h du RDV.
 */
export async function cancelBooking(token: string): Promise<boolean> {
  if (!isUuid(token)) return false;
  await fakeLatency();
  const booking = fakeDb().bookings.find((b) => b.cancel_token === token.toLowerCase());
  if (!booking || booking.status !== "confirmed") return false;
  if (Date.now() > Date.parse(booking.starts_at) - BOOKING_RULES.cancelNoticeHours * HOUR_MS) {
    throw new BookingError("too_late");
  }
  booking.status = "cancelled";
  return true;
}
