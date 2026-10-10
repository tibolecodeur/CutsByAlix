import { fakeDb, fakeLatency, overlapsRange } from "@/lib/fakeDb";
import { randomUuid } from "@/lib/uuid";

/**
 * Couche données de l'espace admin : les écrans n'importent QUE ces fonctions.
 * Elles suivent les tables de supabase/migrations, lues directement par l'admin connecté
 * (la RLS l'autorise grâce à la table `admins`).
 *
 * L'authentification est dans `auth.ts` (vraie, Supabase Auth).
 * TODO: brancher Supabase. Les DONNÉES sont encore factices (src/lib/fakeDb.ts) : remplacer
 * chaque corps par `getSupabaseAdmin().from(…)`, puis convertir la ligne reçue.
 */

export type AdminErrorCode =
  "invalid_range" | "availability_overlap" | "availability_has_bookings" | "not_found";

export class AdminError extends Error {
  readonly code: AdminErrorCode;

  constructor(code: AdminErrorCode) {
    super(code);
    this.name = "AdminError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------------------
// Lieux (table `locations`)
// ---------------------------------------------------------------------------------------

export type Location = {
  id: string;
  publicLabel: string;
  privateAddress: string;
};

export async function getLocations(): Promise<Location[]> {
  await fakeLatency();
  return fakeDb()
    .locations.filter((l) => l.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({ id: l.id, publicLabel: l.public_label, privateAddress: l.private_address }));
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
// Disponibilités (table `availabilities`)
// ---------------------------------------------------------------------------------------

export type Availability = {
  id: string;
  locationId: string;
  locationLabel: string;
  startsAt: string;
  endsAt: string;
};

export type NewAvailability = {
  locationId: string;
  startsAt: string;
  endsAt: string;
};

/** Disponibilités qui ne sont pas encore terminées, dans l'ordre chronologique. */
export async function getAvailabilities(): Promise<Availability[]> {
  await fakeLatency();
  const db = fakeDb();
  const now = Date.now();
  return db.availabilities
    .filter((a) => Date.parse(a.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((a) => ({
      id: a.id,
      locationId: a.location_id,
      locationLabel: db.locations.find((l) => l.id === a.location_id)?.public_label ?? "",
      startsAt: a.starts_at,
      endsAt: a.ends_at,
    }));
}

/**
 * Ajoute une plage. Mêmes refus que la base : fin après début et 24 h maximum
 * (`availabilities_valid_range`), aucun chevauchement tous lieux confondus
 * (`availabilities_no_overlap`, erreur Postgres 23P01 à traduire au branchement).
 */
export async function createAvailability(input: NewAvailability): Promise<Availability> {
  await fakeLatency();
  const db = fakeDb();
  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  if (!(end > start) || end - start > 24 * 60 * 60 * 1000) throw new AdminError("invalid_range");
  const location = db.locations.find((l) => l.id === input.locationId);
  if (!location) throw new AdminError("not_found");
  if (
    db.availabilities.some((a) =>
      overlapsRange(a.starts_at, a.ends_at, input.startsAt, input.endsAt),
    )
  ) {
    throw new AdminError("availability_overlap");
  }

  const row = {
    id: randomUuid(),
    location_id: location.id,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(end).toISOString(),
  };
  db.availabilities.push(row);
  return {
    id: row.id,
    locationId: row.location_id,
    locationLabel: location.public_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

/**
 * Supprime une plage. Refusé s'il reste des RDV futurs confirmés dedans (trigger
 * `availabilities_before_change`) : le barber doit d'abord les annuler.
 */
export async function deleteAvailability(id: string): Promise<void> {
  await fakeLatency();
  const db = fakeDb();
  const availability = db.availabilities.find((a) => a.id === id);
  if (!availability) throw new AdminError("not_found");
  const now = Date.now();
  const hasBookings = db.bookings.some(
    (b) =>
      b.status === "confirmed" &&
      Date.parse(b.ends_at) > now &&
      b.location_id === availability.location_id &&
      Date.parse(b.starts_at) >= Date.parse(availability.starts_at) &&
      Date.parse(b.ends_at) <= Date.parse(availability.ends_at),
  );
  if (hasBookings) throw new AdminError("availability_has_bookings");
  db.availabilities = db.availabilities.filter((a) => a.id !== id);
}
