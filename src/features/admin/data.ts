import type { BookingRules } from "@/features/admin/slots";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Couche données de l'espace admin : les écrans n'importent QUE ces fonctions.
 *
 * Branché sur Supabase (client admin, session d'Alix) : lieux, disponibilités et rendez-vous.
 * Plages et rendez-vous passent par des RPC dédiées (`admin_*`, migrations
 * …_admin_disponibilites.sql et …_admin_reservations.sql) qui valident tout côté base ; l'admin
 * n'a plus aucun droit direct sur ces tables. L'authentification est dans `auth.ts`.
 *
 * Données client (nom, téléphone, e-mail) : jamais dans une erreur, la console ni un log. Les
 * erreurs ne portent qu'un code stable.
 */

/** Clés d'erreur stables des RPC admin (exceptions P0001 / 42501), plus réseau et inconnu. */
export type AdminErrorCode =
  | "invalid_input"
  | "invalid_range"
  | "in_past"
  | "too_short"
  | "location_inactive"
  | "availability_overlap"
  | "availability_has_bookings"
  | "not_found"
  | "already_started"
  | "forbidden"
  | "unknown";

const BUSINESS_ERROR_CODES: readonly AdminErrorCode[] = [
  "invalid_input",
  "invalid_range",
  "in_past",
  "too_short",
  "location_inactive",
  "availability_overlap",
  "availability_has_bookings",
  "not_found",
  "already_started",
];

export class AdminError extends Error {
  readonly code: AdminErrorCode;

  constructor(code: AdminErrorCode) {
    super(code);
    this.name = "AdminError";
    this.code = code;
  }
}

/**
 * Traduit l'erreur d'une requête en `AdminError`. Seules les exceptions métier (P0001, clé
 * connue) et le refus de droits (42501) gardent leur sens ; le reste devient « unknown ». Le
 * message d'origine n'est jamais recopié ni écrit dans la console.
 */
function toAdminError(error: { code?: string; message: string }): AdminError {
  if (error.code === "42501") return new AdminError("forbidden");
  const code = BUSINESS_ERROR_CODES.find((known) => known === error.message);
  return new AdminError(error.code === "P0001" && code ? code : "unknown");
}

/** Le client admin ; une config absente est traitée comme une panne (« réessaie »). */
function client() {
  try {
    return getSupabaseAdmin();
  } catch {
    throw new AdminError("unknown");
  }
}

/** Au-delà, on abandonne une LECTURE : en 4G instable, mieux vaut « Réessayer ». */
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------------------
// Règles de réservation (RPC `admin_booking_rules`, lues dans private.settings())
// ---------------------------------------------------------------------------------------

export async function getBookingRules(): Promise<BookingRules> {
  const { data, error } = await client()
    .rpc("admin_booking_rules")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  const row = data[0];
  if (!row) throw new AdminError("unknown");
  return {
    slotStepMin: row.slot_step_min,
    minNoticeMin: row.min_notice_min,
    maxAdvanceDays: row.max_advance_days,
  };
}

// ---------------------------------------------------------------------------------------
// Lieux (table `locations`, colonnes id, public_label, active : jamais l'adresse privée)
// ---------------------------------------------------------------------------------------

export type Location = {
  id: string;
  publicLabel: string;
};

/**
 * Lieux ACTIFS, par ordre alphabétique (l'admin n'a pas le droit de lire `sort_order`). Seul le
 * développeur active un lieu, en même temps qu'il saisit sa vraie adresse (SQL Editor).
 */
export async function getLocations(): Promise<Location[]> {
  const { data, error } = await client()
    .from("locations")
    .select("id, public_label")
    .eq("active", true)
    .order("public_label")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  return data.map((l) => ({ id: l.id, publicLabel: l.public_label }));
}

// ---------------------------------------------------------------------------------------
// Rendez-vous (RPC `admin_list_bookings`, `admin_get_booking`, `admin_cancel_booking`)
// ---------------------------------------------------------------------------------------

/** Qui a annulé : le client (lien personnel) ou Alix (espace admin). */
export type CancelledBy = "client" | "barber";

/** Un rendez-vous dans une liste : sans téléphone ni e-mail (lus au détail seulement). */
export type AdminBooking = {
  id: string;
  status: "confirmed" | "cancelled";
  cancelledBy: CancelledBy | null;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  /** Libellé public du lieu (la ville), jamais l'adresse. */
  locationLabel: string;
  firstName: string;
  lastName: string;
};

/** Détail d'un rendez-vous : le seul endroit où arrivent les coordonnées du client. */
export type AdminBookingDetails = AdminBooking & {
  phone: string | null;
  email: string | null;
};

/** « À venir » (pas encore terminés) ou « Passées » (terminés depuis 30 jours au plus). */
export type AdminBookingsScope = "upcoming" | "past";

type AdminBookingListRow = {
  id: string;
  status: "confirmed" | "cancelled";
  cancelled_by: CancelledBy | null;
  starts_at: string;
  ends_at: string;
  service_name: string;
  location_label: string;
  first_name: string;
  last_name: string;
};

function toAdminBooking(row: AdminBookingListRow): AdminBooking {
  return {
    id: row.id,
    status: row.status,
    cancelledBy: row.cancelled_by,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName: row.service_name,
    locationLabel: row.location_label,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

/**
 * Rendez-vous d'une portée, annulés compris. « À venir » : chronologique, celui en cours
 * compris ; « Passées » : du plus récent au plus ancien. L'ordre est celui de la base.
 */
export async function getAdminBookings(scope: AdminBookingsScope): Promise<AdminBooking[]> {
  const { data, error } = await client()
    .rpc("admin_list_bookings", { p_scope: scope })
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  return data.map(toAdminBooking);
}

/** Détail d'un rendez-vous, avec le contact du client. Inconnu : `AdminError("not_found")`. */
export async function getAdminBooking(id: string): Promise<AdminBookingDetails> {
  const { data, error } = await client()
    .rpc("admin_get_booking", { p_id: id })
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  const row = data[0];
  if (!row) throw new AdminError("not_found");
  return { ...toAdminBooking(row), phone: row.phone, email: row.email };
}

/**
 * Annulation par Alix, sans délai de 24 h ; le créneau redevient réservable. Résout aussi si
 * le RDV était déjà annulé (`false` côté base : double clic, autre onglet, rejeu) : le
 * résultat est le même pour Alix. Rejette `already_started` si le RDV a commencé.
 * Pas de délai d'abandon : une écriture interrompue laisserait croire à un échec.
 */
export async function cancelAdminBooking(id: string): Promise<void> {
  const { error } = await client().rpc("admin_cancel_booking", { p_id: id });
  if (error) throw toAdminError(error);
}

// ---------------------------------------------------------------------------------------
// Disponibilités (RPC `admin_list_availabilities`, `admin_create_availability`,
// `admin_delete_availability`)
// ---------------------------------------------------------------------------------------

export type Availability = {
  id: string;
  locationId: string;
  locationLabel: string;
  startsAt: string;
  endsAt: string;
  slotCount: number;
  bookingCount: number;
};

export type NewAvailability = {
  locationId: string;
  startsAt: string;
  endsAt: string;
};

type AvailabilityRow = {
  id: string;
  location_id: string;
  location_label: string;
  starts_at: string;
  ends_at: string;
  slot_count: number;
  booking_count: number;
};

function toAvailability(row: AvailabilityRow): Availability {
  return {
    id: row.id,
    locationId: row.location_id,
    locationLabel: row.location_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    slotCount: row.slot_count,
    bookingCount: row.booking_count,
  };
}

/** Plages pas encore terminées, dans l'ordre chronologique, avec créneaux et RDV comptés. */
export async function getAvailabilities(): Promise<Availability[]> {
  const { data, error } = await client()
    .rpc("admin_list_availabilities")
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw toAdminError(error);
  return data.map(toAvailability);
}

/**
 * Ajoute une plage. La base refuse : plage passée (`in_past`), fin avant début ou plus de 24 h
 * (`invalid_range`), moins d'un créneau (`too_short`), lieu inactif (`location_inactive`),
 * chevauchement tous lieux confondus (`availability_overlap`).
 * Sans délai d'abandon : couper la requête n'annulerait pas l'insertion côté base.
 */
export async function createAvailability(input: NewAvailability): Promise<Availability> {
  const { data, error } = await client().rpc("admin_create_availability", {
    p_location_id: input.locationId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });
  if (error) throw toAdminError(error);
  const row = data[0];
  if (!row) throw new AdminError("unknown");
  return toAvailability(row);
}

/**
 * Supprime une plage. Refusé (`availability_has_bookings`) dès qu'une réservation confirmée
 * la touche : le barber annule d'abord les RDV. Aucune réservation n'est jamais supprimée.
 */
export async function deleteAvailability(id: string): Promise<void> {
  const { error } = await client().rpc("admin_delete_availability", { p_id: id });
  if (error) throw toAdminError(error);
}
