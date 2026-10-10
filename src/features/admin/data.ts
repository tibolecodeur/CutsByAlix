import type { BookingRules } from "@/features/admin/slots";
import { fakeDb, fakeLatency } from "@/lib/fakeDb";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Couche données de l'espace admin : les écrans n'importent QUE ces fonctions.
 *
 * Branché sur Supabase (client admin, session d'Alix) : lieux et disponibilités. Les écritures
 * de plages passent par des RPC dédiées (`admin_*`, migration …_admin_disponibilites.sql) qui
 * valident tout côté base ; l'admin n'a plus le droit d'écrire directement dans la table.
 * L'authentification est dans `auth.ts`.
 *
 * TODO: brancher Supabase. Les RENDEZ-VOUS sont encore factices (src/lib/fakeDb.ts).
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
// Rendez-vous (table `bookings`)
// ---------------------------------------------------------------------------------------

export type AdminBooking = {
  id: string;
  status: "confirmed" | "cancelled";
  startsAt: string;
  endsAt: string;
  serviceName: string;
  locationLabel: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

export type AdminBookingsFilter = {
  /** RDV qui finissent après cet instant (ISO). */
  from: string;
  /** RDV qui commencent avant cet instant (ISO). Sans limite si absent. */
  to?: string;
  includeCancelled?: boolean;
};

/** RDV d'une période, du plus proche au plus lointain. */
export async function getAdminBookings(filter: AdminBookingsFilter): Promise<AdminBooking[]> {
  await fakeLatency();
  const db = fakeDb();
  const from = Date.parse(filter.from);
  const to = filter.to === undefined ? Infinity : Date.parse(filter.to);
  return db.bookings
    .filter(
      (b) =>
        Date.parse(b.ends_at) > from &&
        Date.parse(b.starts_at) < to &&
        (filter.includeCancelled || b.status === "confirmed"),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((b) => ({
      id: b.id,
      status: b.status,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      serviceName: db.services.find((s) => s.id === b.service_id)?.name ?? "",
      locationLabel: db.locations.find((l) => l.id === b.location_id)?.public_label ?? "",
      firstName: b.first_name,
      lastName: b.last_name,
      phone: b.phone,
      email: b.email,
    }));
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
