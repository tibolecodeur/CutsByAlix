/**
 * Types de la base, écrits À LA MAIN d'après supabase/migrations (pas de `supabase gen types`,
 * qui demanderait une connexion de la CLI au projet). Même forme que le fichier généré, pour
 * pouvoir le remplacer plus tard sans toucher au reste.
 *
 * À mettre à jour à chaque migration qui touche une table ou une fonction listée ici. Seules
 * celles réellement utilisées par le front y figurent (pour l'instant : les tables `services` et
 * `admins`, les RPC `get_available_slots`, `create_booking`, `get_booking` et `cancel_booking`).
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

export type Database = {
  public: {
    Tables: {
      services: ServicesTable;
      admins: AdminsTable;
    };
    Views: Record<never, never>;
    Functions: {
      get_available_slots: GetAvailableSlotsFunction;
      create_booking: CreateBookingFunction;
      get_booking: GetBookingFunction;
      cancel_booking: CancelBookingFunction;
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
