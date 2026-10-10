/**
 * Types de la base, écrits À LA MAIN d'après supabase/migrations (pas de `supabase gen types`,
 * qui demanderait une connexion de la CLI au projet). Même forme que le fichier généré, pour
 * pouvoir le remplacer plus tard sans toucher au reste.
 *
 * À mettre à jour à chaque migration qui touche une table ou une fonction listée ici. Seules
 * celles réellement utilisées par le front y figurent (pour l'instant : les tables `services`,
 * `admins` et `locations` (vue admin), les RPC publiques `get_available_slots`,
 * `create_booking`, `get_booking`, `cancel_booking` et les 4 RPC `admin_*` des disponibilités).
 */

/** Table `public.services` (migration …_tables.sql). */
type ServicesTable = {
  Row: {
    id: string;
    /** 1 à 80 caractères, sans espace au début ni à la fin. */
    name: string;
    /** Entre 15 et 240, multiple de 5. */
    duration_min: number;
    /** Prix affiché tel quel, 40 caractères max ; null tant qu'il n'est pas fixé. */
    price_label: string | null;
    active: boolean;
    sort_order: number;
    /** timestamptz, renvoyé en ISO 8601. */
    created_at: string;
  };
  Insert: {
    id?: string;
    name: string;
    duration_min: number;
    price_label?: string | null;
    active?: boolean;
    sort_order?: number;
    created_at?: string;
  };
  Update: Partial<ServicesTable["Insert"]>;
  Relationships: [];
};

/**
 * RPC `get_available_slots` (migration …_reservation_reelle.sql) : créneaux libres d'un jour
 * (heure de Paris). Jamais d'adresse privée.
 */
type GetAvailableSlotsFunction = {
  Args: {
    p_service_id: string;
    /** Jour calendaire « yyyy-MM-dd ». */
    p_day: string;
  };
  Returns: {
    starts_at: string;
    ends_at: string;
    location_id: string;
    /** Libellé public du lieu (la ville). */
    location_label: string;
  }[];
};

/**
 * RPC `create_booking` (migration …_reservation_reelle.sql). Erreurs : exceptions P0001 dont
 * le message est une clé stable (invalid_input, slot_unavailable, too_soon, too_far,
 * limit_reached). Le récap ne contient PAS l'adresse privée.
 */
type CreateBookingFunction = {
  Args: {
    p_service_id: string;
    p_starts_at: string;
    p_location_id: string;
    p_first_name: string;
    p_last_name: string;
    p_phone?: string | null;
    p_email?: string | null;
    /** Honeypot : vide pour un humain. */
    p_website?: string | null;
  };
  Returns: {
    starts_at: string;
    ends_at: string;
    service_name: string;
    location_label: string;
    /** Renvoyé une seule fois, ici : aucune autre fonction ne le relit. */
    cancel_token: string;
  }[];
};

/**
 * RPC `get_booking` (migration …_annulation_testable.sql) : récap pour le porteur du lien.
 * Aucune ligne si le jeton est inconnu, nul ou si le RDV est terminé (lien « expiré »). Ni
 * adresse privée, ni téléphone, ni email, ni nom de famille.
 */
type GetBookingFunction = {
  Args: { p_token: string };
  Returns: {
    status: "confirmed" | "cancelled";
    starts_at: string;
    ends_at: string;
    service_name: string;
    location_label: string;
    first_name: string;
    /** Confirmé ET à 24 h ou plus du début. */
    can_cancel: boolean;
  }[];
};

/**
 * RPC `cancel_booking` (migration …_annulation_testable.sql) : `true` annulé ; `false` jeton
 * inconnu, RDV déjà annulé ou terminé ; exception P0001 `too_late` à moins de 24 h du début.
 */
type CancelBookingFunction = {
  Args: { p_token: string };
  Returns: boolean;
};

/**
 * Table `public.admins` (migration …_socle_securite.sql) : lue par l'admin connecté pour
 * vérifier SA ligne (la RLS ne montre rien aux autres). Jamais écrite via l'API.
 */
type AdminsTable = {
  Row: { user_id: string; created_at: string };
  Insert: never;
  Update: never;
  Relationships: [];
};

/**
 * Table `public.locations`, vue par l'ADMIN (migration …_admin_disponibilites.sql) : il n'a le
 * droit de lire que ces trois colonnes. `private_address` n'y figure volontairement pas (le
 * demander échouerait en 42501). Aucune écriture via l'API.
 */
type LocationsTable = {
  Row: { id: string; public_label: string; active: boolean };
  Insert: never;
  Update: never;
  Relationships: [];
};

/** Ligne commune à `admin_list_availabilities` et `admin_create_availability`. */
type AdminAvailabilityRow = {
  id: string;
  location_id: string;
  /** Libellé public du lieu (la ville), jamais l'adresse. */
  location_label: string;
  starts_at: string;
  ends_at: string;
  /** Créneaux qui tiennent dans la plage (pas de la grille de private.settings()). */
  slot_count: number;
  /** RDV confirmés du lieu qui touchent la plage, passés comme futurs. */
  booking_count: number;
};

/**
 * RPC admin (migration …_admin_disponibilites.sql), réservées à un utilisateur listé dans
 * `admins` (sinon 42501 « forbidden »). Erreurs métier : exceptions P0001 dont le message est
 * une clé stable (invalid_input, invalid_range, in_past, too_short, location_inactive,
 * availability_overlap, availability_has_bookings, not_found).
 */
type AdminBookingRulesFunction = {
  Args: Record<string, never>;
  Returns: { slot_step_min: number; min_notice_min: number; max_advance_days: number }[];
};
type AdminListAvailabilitiesFunction = {
  Args: Record<string, never>;
  Returns: AdminAvailabilityRow[];
};
type AdminCreateAvailabilityFunction = {
  Args: { p_location_id: string; p_starts_at: string; p_ends_at: string };
  Returns: AdminAvailabilityRow[];
};
type AdminDeleteAvailabilityFunction = {
  Args: { p_id: string };
  Returns: undefined;
};

export type Database = {
  public: {
    Tables: {
      services: ServicesTable;
      admins: AdminsTable;
      locations: LocationsTable;
    };
    Views: Record<never, never>;
    Functions: {
      get_available_slots: GetAvailableSlotsFunction;
      create_booking: CreateBookingFunction;
      get_booking: GetBookingFunction;
      cancel_booking: CancelBookingFunction;
      admin_booking_rules: AdminBookingRulesFunction;
      admin_list_availabilities: AdminListAvailabilitiesFunction;
      admin_create_availability: AdminCreateAvailabilityFunction;
      admin_delete_availability: AdminDeleteAvailabilityFunction;
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
