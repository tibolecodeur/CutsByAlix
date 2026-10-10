import { HOUR_MS } from "@/lib/bookingRules";
import { addDaysToKey, isoWeekday, parisDateTime, parisDayKey, type DayKey } from "@/lib/dates";
import { randomUuid } from "@/lib/uuid";

/**
 * Fausse base de données EN MÉMOIRE, pour construire les écrans sans Supabase.
 * TODO: brancher Supabase. Ce fichier disparaîtra : seuls les `data.ts` de chaque
 * fonctionnalité le lisent, jamais les écrans.
 *
 * Les lignes ont la forme exacte des tables de supabase/migrations (snake_case, dates ISO),
 * comme les renverra Supabase. Numéros de téléphone : plage 06 39 98 xx xx, réservée à la
 * fiction par l'ARCEP (aucun abonné réel). Les données sont recréées à chaque chargement de la page :
 * une réservation faite dans l'onglet disparaît au rechargement.
 */

export type ServiceRow = {
  id: string;
  name: string;
  duration_min: number;
  price_label: string | null;
  active: boolean;
  sort_order: number;
};

export type LocationRow = {
  id: string;
  public_label: string;
  private_address: string;
  active: boolean;
  sort_order: number;
};

export type AvailabilityRow = {
  id: string;
  location_id: string;
  starts_at: string;
  ends_at: string;
};

export type BookingRow = {
  id: string;
  service_id: string;
  location_id: string;
  starts_at: string;
  ends_at: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  status: "confirmed" | "cancelled";
  cancel_token: string;
  created_at: string;
};

export type GalleryItemRow = {
  id: string;
  image_path: string;
  caption: string | null;
  sort_order: number;
  published: boolean;
  created_at: string;
};

export type FakeDb = {
  services: ServiceRow[];
  locations: LocationRow[];
  availabilities: AvailabilityRow[];
  bookings: BookingRow[];
  gallery_items: GalleryItemRow[];
  /** Aperçus locaux des photos « envoyées » (URL blob:), par image_path. Pas une table. */
  galleryPreviews: Map<string, string>;
};

/**
 * Jetons des faux RDV de démonstration (liste de l'admin). La page /annuler, elle, lit la
 * vraie base : ces jetons n'y donnent plus accès à rien.
 */
export const FAKE_CANCEL_TOKENS = {
  /** RDV confirmé dans quelques jours : annulable. */
  valid: "11111111-1111-4111-8111-111111111111",
  /** RDV déjà annulé. */
  cancelled: "22222222-2222-4222-8222-222222222222",
  /** RDV qui commence dans moins de 24 h : trop tard pour annuler. */
  tooLate: "33333333-3333-4333-8333-333333333333",
} as const;

const SERVICE_IDS = {
  cut: "5e000000-0000-4000-8000-000000000001",
  cutAndBeard: "5e000000-0000-4000-8000-000000000002",
};

const LOCATION_IDS = {
  locationA: "10c00000-0000-4000-8000-000000000001",
  locationB: "10c00000-0000-4000-8000-000000000002",
};

/** Plages publiées chaque semaine, par jour ISO (2 = mardi…). Dimanche et lundi : rien. */
const WEEKLY_AVAILABILITIES: Record<number, { from: string; to: string; locationId: string }[]> = {
  2: [{ from: "14:00", to: "18:00", locationId: LOCATION_IDS.locationB }],
  3: [{ from: "17:00", to: "20:00", locationId: LOCATION_IDS.locationA }],
  5: [{ from: "17:00", to: "20:00", locationId: LOCATION_IDS.locationB }],
  6: [
    { from: "10:00", to: "13:00", locationId: LOCATION_IDS.locationA },
    { from: "14:00", to: "18:00", locationId: LOCATION_IDS.locationB },
  ],
};

/** Deux intervalles [début, fin) se chevauchent-ils ? Mêmes règles que tstzrange(…, "[)"). */
export function overlapsRange(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}

/** Premier jour, à partir de `from`, qui tombe le jour de semaine ISO voulu. */
function nextWeekday(from: DayKey, weekday: number): DayKey {
  let day = from;
  while (isoWeekday(day) !== weekday) day = addDaysToKey(day, 1);
  return day;
}

/** Données de démonstration, calculées par rapport à `now` pour rester toujours « à venir ». */
function seed(now: Date): FakeDb {
  const today = parisDayKey(now);
  const createdAt = now.toISOString();
  const at = (day: DayKey, time: string) => parisDateTime(day, time).toISOString();
  const plusHour = (iso: string) => new Date(Date.parse(iso) + HOUR_MS).toISOString();

  const availabilities: AvailabilityRow[] = [];
  for (let offset = 0; offset < 28; offset++) {
    const day = addDaysToKey(today, offset);
    // Aujourd'hui : une grande plage, pour que le tableau de bord admin ait des RDV du jour.
    const ranges =
      offset === 0
        ? [{ from: "09:00", to: "21:00", locationId: LOCATION_IDS.locationB }]
        : (WEEKLY_AVAILABILITIES[isoWeekday(day)] ?? []);
    for (const range of ranges) {
      availabilities.push({
        id: randomUuid(),
        location_id: range.locationId,
        starts_at: at(day, range.from),
        ends_at: at(day, range.to),
      });
    }
  }

  const booking = (
    fields: Pick<BookingRow, "starts_at" | "first_name" | "last_name" | "phone" | "email"> &
      Partial<BookingRow>,
  ): BookingRow => ({
    id: randomUuid(),
    service_id: SERVICE_IDS.cut,
    location_id: LOCATION_IDS.locationB,
    ends_at: plusHour(fields.starts_at),
    status: "confirmed",
    cancel_token: randomUuid(),
    created_at: createdAt,
    ...fields,
  });

  // RDV qui commence à la prochaine heure pile : moins de 24 h, donc plus annulable.
  const nextHour = new Date(Math.ceil((now.getTime() + 1) / HOUR_MS) * HOUR_MS).toISOString();
  const tooLate = booking({
    starts_at: nextHour,
    first_name: "Nathan",
    last_name: "Bernard",
    phone: "0639980001",
    email: null,
    cancel_token: FAKE_CANCEL_TOKENS.tooLate,
  });

  const saturday = nextWeekday(addDaysToKey(today, 2), 6);
  const tuesday = nextWeekday(addDaysToKey(today, 2), 2);
  const bookings: BookingRow[] = [
    tooLate,
    booking({
      starts_at: at(saturday, "10:00"),
      location_id: LOCATION_IDS.locationA,
      service_id: SERVICE_IDS.cutAndBeard,
      first_name: "Lucas",
      last_name: "Martin",
      phone: "0639980002",
      email: "lucas.martin@example.com",
      cancel_token: FAKE_CANCEL_TOKENS.valid,
    }),
    booking({
      starts_at: at(tuesday, "15:10"), // grille de 70 min : 14:00, 15:10, 16:20
      first_name: "Inès",
      last_name: "Petit",
      phone: null,
      email: "ines.petit@example.com",
      status: "cancelled",
      cancel_token: FAKE_CANCEL_TOKENS.cancelled,
    }),
    booking({
      starts_at: at(tuesday, "16:20"),
      first_name: "Yanis",
      last_name: "Robert",
      phone: "0639980003",
      email: null,
    }),
  ];
  // Deux RDV aujourd'hui, sauf s'ils tombent en même temps que le RDV « trop tard ».
  for (const [time, firstName, lastName] of [
    ["11:00", "Sami", "Durand"],
    ["19:00", "Hugo", "Moreau"],
  ] as const) {
    const startsAt = at(today, time);
    if (!overlapsRange(startsAt, plusHour(startsAt), tooLate.starts_at, tooLate.ends_at)) {
      bookings.push(
        booking({
          starts_at: startsAt,
          first_name: firstName,
          last_name: lastName,
          phone: "0639980004",
          email: null,
        }),
      );
    }
  }

  return {
    services: [
      {
        id: SERVICE_IDS.cut,
        name: "Coupe",
        duration_min: 60,
        price_label: null,
        active: true,
        sort_order: 1,
      },
      {
        id: SERVICE_IDS.cutAndBeard,
        name: "Coupe + barbe",
        duration_min: 60,
        price_label: null,
        active: true,
        sort_order: 2,
      },
    ],
    // Adresses fictives : aucune vraie adresse dans le dépôt (docs/SPEC.md).
    locations: [
      {
        id: LOCATION_IDS.locationA,
        public_label: "Angers",
        private_address: "1 rue de l'Exemple, 00000 Ville (adresse fictive)",
        active: true,
        sort_order: 1,
      },
      {
        id: LOCATION_IDS.locationB,
        public_label: "Saint-Christophe-du-Bois",
        private_address: "2 avenue de la Démo, 00000 Ville (adresse fictive)",
        active: true,
        sort_order: 2,
      },
    ],
    availabilities,
    bookings,
    gallery_items: [1, 2, 3].map((n) => ({
      id: randomUuid(),
      image_path: `demo/creation-${n}.jpg`,
      caption: `Création de démonstration n° ${n}`,
      sort_order: n,
      published: true,
      created_at: createdAt,
    })),
    galleryPreviews: new Map(),
  };
}

let db: FakeDb | null = null;

/** La fausse base, créée au premier accès. */
export function fakeDb(): FakeDb {
  db ??= seed(new Date());
  return db;
}

/** Repart de données neuves, calculées à partir de `now` (tests). */
export function resetFakeDb(now: Date = new Date()): FakeDb {
  db = seed(now);
  return db;
}

/**
 * Latence réseau simulée, pour voir les états « chargement » pendant le développement.
 * Nulle dans les tests unitaires (Vitest définit MODE = "test").
 */
export async function fakeLatency(): Promise<void> {
  if (import.meta.env.MODE === "test") return;
  await new Promise((resolve) => setTimeout(resolve, 350));
}
