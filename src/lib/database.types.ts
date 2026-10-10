/**
 * Types de la base, écrits À LA MAIN d'après supabase/migrations (pas de `supabase gen types`,
 * qui demanderait une connexion de la CLI au projet). Même forme que le fichier généré, pour
 * pouvoir le remplacer plus tard sans toucher au reste.
 *
 * À mettre à jour à chaque migration qui touche une table ou une fonction listée ici. Seules
 * celles réellement utilisées par le front y figurent (pour l'instant : la table `services`,
 * les RPC `get_available_slots` et `create_booking`).
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

export type Database = {
  public: {
    Tables: {
      services: ServicesTable;
    };
    Views: Record<never, never>;
    Functions: {
      get_available_slots: GetAvailableSlotsFunction;
      create_booking: CreateBookingFunction;
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
