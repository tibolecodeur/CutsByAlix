import type { DayKey } from "@/lib/dates";
import {
  availableDayRowsSchema,
  availableSlotRowsSchema,
  bookingDetailsRowsSchema,
  bookingReceiptRowsSchema,
  cancelResultSchema,
  serviceRowsSchema,
} from "@/lib/schemas";
import { getSupabase } from "@/lib/supabase";

/**
 * Couche données de la réservation : les écrans n'importent QUE ces fonctions.
 * Chaque fonction a la forme de la table ou de la RPC Supabase correspondante
 * (supabase/migrations/…_reservation_reelle.sql), avec des noms en camelCase.
 *
 * Tout est branché sur Supabase : `getServices` (table), `getAvailableSlots`, `createBooking`,
 * `getBooking` et `cancelBooking` (RPC). Le `cancel_token` ne doit jamais être écrit dans la
 * console, un message d'erreur ni une URL de requête : il ne part que dans le corps des `POST`.
 *
 * Erreurs (C-01, C-02 de l'audit) : TOUT échec devient une `BookingError` avec un code interne,
 * jamais le message d'origine (il peut contenir du SQL, des noms de colonnes ou le jeton). Toute
 * réponse est validée (schémas Zod de `lib/schemas.ts`) : vide, mal formée ou inattendue =
 * `invalid_response`, jamais un faux succès.
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
 * Libellé public (la localité) : aucune adresse n'est stockée (ADR 0008).
 */
export type AvailableSlot = {
  startsAt: string;
  endsAt: string;
  locationId: string;
  locationLabel: string;
};

/** Un jour du calendrier qui a au moins un créneau (RPC `get_available_days`). */
export type AvailableDay = {
  /** Jour « yyyy-MM-dd », en heure de Paris. */
  day: DayKey;
  slotCount: number;
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
 * Ligne renvoyée par la RPC `create_booking` : le récapitulatif. Pas d'adresse : le site n'en
 * stocke aucune (ADR 0008), le client la demande à Alix sur Instagram.
 */
export type BookingReceipt = {
  startsAt: string;
  endsAt: string;
  serviceName: string;
  locationLabel: string;
  /** Seul moyen d'annuler : renvoyé une seule fois, jamais journalisé. */
  cancelToken: string;
};

/** Ligne renvoyée par la RPC `get_booking` (ni téléphone, ni email). */
export type BookingDetails = {
  status: "confirmed" | "cancelled";
  startsAt: string;
  endsAt: string;
  serviceName: string;
  locationLabel: string;
  firstName: string;
  canCancel: boolean;
  /** Qui a annulé (null tant que confirmé) : « annulé par Alix » s'affiche autrement. */
  cancelledBy: "client" | "barber" | null;
};

/**
 * Clés d'erreur stables renvoyées par les RPC (exceptions P0001), plus deux codes du front :
 * « unknown » (réseau, panne, config) et « invalid_response » (réponse vide ou inattendue).
 */
export type BookingErrorCode =
  | "invalid_input"
  | "slot_unavailable"
  | "too_soon"
  | "too_far"
  | "limit_reached"
  | "too_late"
  | "request_conflict"
  | "invalid_response"
  | "unknown";

const RPC_ERROR_CODES: readonly BookingErrorCode[] = [
  "invalid_input",
  "slot_unavailable",
  "too_soon",
  "too_far",
  "limit_reached",
  "too_late",
  "request_conflict",
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
  let response;
  try {
    response = await getSupabase()
      .from("services")
      .select("id, name, duration_min, price_label")
      .order("sort_order")
      .order("name")
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  } catch {
    throw new BookingError("unknown");
  }
  if (response.error) throw new BookingError("unknown");
  const parsed = serviceRowsSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");

  const services = parsed.data.map((s) => ({
    id: s.id,
    name: s.name,
    durationMin: s.duration_min,
    priceLabel: s.price_label,
  }));
  return services;
}

/**
 * RPC `get_available_days(p_service_id)` : les jours des 4 prochaines semaines qui ont au moins
 * un créneau, avec leur nombre de créneaux, en UNE requête (au lieu d'une par jour). Mêmes règles
 * que `getAvailableSlots`. Un jour absent de la liste n'a aucun créneau (passé, hors période,
 * trop proche, tout pris, ou aucune plage). Rejette en cas d'erreur réseau ou de base.
 */
export async function getAvailableDays(serviceId: string): Promise<AvailableDay[]> {
  let response;
  try {
    response = await getSupabase()
      .rpc("get_available_days", { p_service_id: serviceId })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  } catch {
    throw new BookingError("unknown");
  }
  if (response.error) throw new BookingError("unknown");
  const parsed = availableDayRowsSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");

  return parsed.data.map((row) => ({ day: row.day, slotCount: row.slot_count }));
}

/**
 * RPC `get_available_slots(p_service_id, p_day)` : créneaux libres d'un jour (heure de Paris),
 * déjà filtrés par la base (lieux actifs, au moins 2 h, au plus 4 semaines, grille de 70 min,
 * créneaux pris retirés). Rejette en cas d'erreur réseau, de base ou de config manquante.
 */
export async function getAvailableSlots(serviceId: string, day: DayKey): Promise<AvailableSlot[]> {
  let response;
  try {
    response = await getSupabase()
      .rpc("get_available_slots", { p_service_id: serviceId, p_day: day })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  } catch {
    throw new BookingError("unknown");
  }
  if (response.error) throw new BookingError("unknown");
  const parsed = availableSlotRowsSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");

  return parsed.data.map((slot) => ({
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
 * `requestId` : clé d'idempotence (ADR 0009), la MÊME pour tous les essais d'une même
 * réservation. Si la base a déjà enregistré cette réservation mais que la réponse s'est perdue,
 * le nouvel essai renvoie le même récapitulatif (même jeton) au lieu de « créneau pris ».
 * `null` (pas de source aléatoire sûre) : comportement d'avant, sans rejeu possible.
 *
 * Volontairement SANS délai d'abandon : couper la requête côté navigateur n'annule pas
 * l'insertion côté base. Le RDV serait créé, mais le client aurait perdu son seul lien
 * d'annulation. On laisse le navigateur aller au bout (ou échouer de lui-même).
 */
export async function createBooking(
  input: NewBooking,
  requestId: string | null,
): Promise<BookingReceipt> {
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
      p_request_id: requestId,
    });
  } catch {
    // Config manquante (SupabaseConfigError) ou erreur inattendue du client.
    throw new BookingError("unknown");
  }

  if (response.error) throw toBookingError(response.error);
  // Réponse vide ou inattendue : la réservation a PEUT-ÊTRE été créée. Le nouvel essai, avec
  // la même clé, renverra son récapitulatif (ADR 0009).
  const parsed = bookingReceiptRowsSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");
  const row = parsed.data[0]!;
  return {
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName: row.service_name,
    locationLabel: row.location_label,
    cancelToken: row.cancel_token,
  };
}

/**
 * RPC `get_booking(p_token)` : le récap du RDV, ou `null` si le lien est invalide. « Invalide »
 * regroupe volontairement : jeton mal formé, inconnu, ou RDV terminé (lien expiré) : la base ne
 * distingue pas ces cas, l'écran non plus. Rejette en cas d'erreur réseau ou de base.
 */
export async function getBooking(token: string): Promise<BookingDetails | null> {
  // Mal formé : inutile d'interroger la base (qui répondrait par une erreur de syntaxe).
  if (!isUuid(token)) return null;

  let response;
  try {
    response = await getSupabase()
      .rpc("get_booking", { p_token: token })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  } catch {
    throw new BookingError("unknown");
  }
  // Message d'origine volontairement NON recopié : il pourrait contenir le jeton.
  if (response.error) throw new BookingError("unknown");
  // Forme inattendue : erreur avec « Réessayer », PAS « Lien invalide » (le lien est peut-être bon).
  const parsed = bookingDetailsRowsSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");

  const row = parsed.data[0];
  if (!row) return null;
  return {
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName: row.service_name,
    locationLabel: row.location_label,
    firstName: row.first_name,
    canCancel: row.can_cancel,
    cancelledBy: row.cancelled_by,
  };
}

/**
 * RPC `cancel_booking(p_token)` : `true` si annulé ; `false` si lien inconnu, RDV déjà annulé
 * ou terminé (même résultat : rien ne fuit) ; erreur `too_late` à moins de 24 h du RDV.
 * Toute autre réponse (vide, null, objet) : `invalid_response`, jamais « annulé ».
 *
 * Volontairement SANS délai d'abandon (couper la requête n'annule pas l'écriture). Rejouer
 * après une coupure réseau est sans danger : la seconde tentative renvoie `false`, que
 * l'écran affiche comme « déjà annulé ».
 */
export async function cancelBooking(token: string): Promise<boolean> {
  if (!isUuid(token)) return false;

  let response;
  try {
    response = await getSupabase().rpc("cancel_booking", { p_token: token });
  } catch {
    // Config manquante (SupabaseConfigError) ou erreur inattendue du client.
    throw new BookingError("unknown");
  }
  if (response.error) throw toBookingError(response.error);
  const parsed = cancelResultSchema.safeParse(response.data);
  if (!parsed.success) throw new BookingError("invalid_response");
  return parsed.data;
}
