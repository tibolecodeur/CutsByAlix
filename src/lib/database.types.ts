/**
 * Types de la base, écrits À LA MAIN d'après supabase/migrations (pas de `supabase gen types`,
 * qui demanderait une connexion de la CLI au projet). Même forme que le fichier généré, pour
 * pouvoir le remplacer plus tard sans toucher au reste.
 *
 * À mettre à jour à chaque migration qui touche une table ou une fonction listée ici. Seules
 * celles réellement utilisées par le front y figurent (pour l'instant : les tables `services`,
 * `admins`, `locations` (vue admin) et `gallery_items` (vue anon), les RPC publiques
 * `get_available_slots`, `create_booking`, `get_booking`, `cancel_booking` et les RPC `admin_*`).
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
 * Table `public.gallery_items` (migration …_admin_galerie.sql), VUE ANONYME : anon ne lit que
 * ces colonnes, et seulement les photos publiées (RLS). Aucune écriture par l'API : l'admin
 * passe par les RPC `admin_*_gallery_*`.
 */
type GalleryItemsTable = {
  Row: {
    id: string;
    /** « <uuid v4>.webp » ou « .jpg », à la racine du bucket privé « gallery ». */
    image_path: string;
    /** 1 à 200 caractères, obligatoire. */
    alt_text: string;
    /** Pixels, 1 à 1200. */
    width: number;
    height: number;
    sort_order: number;
  };
  Insert: never;
  Update: never;
  Relationships: [];
};

/**
 * RPC `get_available_slots` (migration …_reservation_reelle.sql) : créneaux libres d'un jour
 * (heure de Paris). Aucune adresse n'est stockée (ADR 0008).
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
 * RPC `get_available_days` (migration …_jours_disponibles.sql) : les jours (heure de Paris) qui
 * ont au moins un créneau, avec leur nombre de créneaux, en UNE requête. Mêmes règles que
 * `get_available_slots` (elle s'appuie sur la même fonction de calcul). Réponse validée par Zod.
 */
type GetAvailableDaysFunction = {
  Args: { p_service_id: string };
  Returns: {
    /** Jour « yyyy-MM-dd », déjà en heure de Paris : aucun regroupement à faire dans le navigateur. */
    day: string;
    slot_count: number;
  }[];
};

/**
 * RPC `create_booking` (migrations …_reservation_reelle.sql et …_reservation_idempotente.sql).
 * Erreurs : exceptions P0001 dont le message est une clé stable (invalid_input,
 * slot_unavailable, too_soon, too_far, limit_reached, request_conflict). Le récap ne contient
 * que la localité du lieu (ADR 0008). Réponse validée par Zod (lib/schemas.ts).
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
    /** Clé d'idempotence (ADR 0009) : la même pour tous les essais d'une réservation. */
    p_request_id?: string | null;
  };
  Returns: {
    starts_at: string;
    ends_at: string;
    service_name: string;
    location_label: string;
    /** Renvoyé ici seulement (et lors d'un rejeu avec la même clé, ADR 0009). */
    cancel_token: string;
  }[];
};

/** Auteur d'une annulation (colonne `bookings.cancelled_by`). */
export type CancelledBy = "client" | "barber";

/**
 * RPC `get_booking` (migration …_admin_reservations.sql) : récap pour le porteur du lien.
 * Aucune ligne si le jeton est inconnu, nul ou si le RDV est terminé (lien « expiré »). Ni
 * téléphone, ni email, ni nom de famille.
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
    /** Qui a annulé : null tant que le RDV est confirmé. */
    cancelled_by: CancelledBy | null;
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
 * droit de lire que ces trois colonnes (`select *` échouerait en 42501). Aucune adresse n'est
 * stockée (ADR 0008). Aucune écriture via l'API.
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
  /** Libellé public du lieu (la localité). */
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

/** Ligne de `admin_list_bookings` : ni téléphone ni e-mail (lus au détail seulement). */
type AdminBookingListRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  service_name: string;
  /** Libellé public du lieu (la localité). */
  location_label: string;
  first_name: string;
  last_name: string;
  status: "confirmed" | "cancelled";
  cancelled_by: CancelledBy | null;
};

/**
 * RPC admin des réservations (migration …_admin_reservations.sql), réservées à un utilisateur
 * listé dans `admins` (sinon 42501 « forbidden »). Erreurs P0001 : invalid_input, not_found,
 * already_started.
 */
type AdminListBookingsFunction = {
  Args: { p_scope: "upcoming" | "past" };
  Returns: AdminBookingListRow[];
};
type AdminGetBookingFunction = {
  Args: { p_id: string };
  Returns: (AdminBookingListRow & { phone: string | null; email: string | null })[];
};
/** `true` annulé maintenant ; `false` déjà annulé (double clic, rejeu). */
type AdminCancelBookingFunction = {
  Args: { p_id: string };
  Returns: boolean;
};

/** Ligne renvoyée par les RPC admin de la galerie (migration …_admin_galerie.sql). */
type AdminGalleryItemRow = {
  id: string;
  image_path: string;
  alt_text: string;
  width: number;
  height: number;
  sort_order: number;
  published: boolean;
  /** Dernier accord confirmé par Alix (timestamptz ISO), null si jamais publiée. */
  consent_at: string | null;
  created_at: string;
};

/**
 * RPC admin de la galerie, réservées à un utilisateur listé dans `admins` (sinon 42501
 * « forbidden »). Erreurs P0001 : invalid_input, invalid_path, file_missing, already_exists,
 * gallery_limit_reached, consent_required, not_found.
 */
type AdminListGalleryItemsFunction = {
  Args: Record<string, never>;
  Returns: AdminGalleryItemRow[];
};
type AdminAddGalleryItemFunction = {
  Args: {
    p_image_path: string;
    p_alt_text: string;
    p_width: number;
    p_height: number;
    /** `true` : accord confirmé, la photo est publiée tout de suite. */
    p_consent: boolean;
  };
  Returns: AdminGalleryItemRow[];
};
type AdminSetGalleryItemPublishedFunction = {
  Args: { p_id: string; p_published: boolean; p_consent: boolean };
  Returns: undefined;
};
type AdminUpdateGalleryItemAltFunction = {
  Args: { p_id: string; p_alt_text: string };
  Returns: undefined;
};
/**
 * Masque une photo en pointant sa ligne vers une COPIE du fichier (nouveau nom) ; renvoie
 * l'ancien chemin, que le front efface : les URL signées déjà émises meurent avec lui.
 */
type AdminHideGalleryItemFunction = {
  Args: { p_id: string; p_new_path: string };
  Returns: string;
};
/** `false` : déjà en tête (ou en queue), rien n'a bougé. */
type AdminMoveGalleryItemFunction = {
  Args: { p_id: string; p_direction: "up" | "down" };
  Returns: boolean;
};
/** Renvoie le chemin du fichier, que le front efface ensuite par l'API Storage. */
type AdminDeleteGalleryItemFunction = {
  Args: { p_id: string };
  Returns: string;
};
/** Notifications push (migration …_notifications_push.sql). */
type AdminSavePushSubscriptionFunction = {
  Args: { p_endpoint: string; p_p256dh: string; p_auth: string };
  Returns: undefined;
};
type AdminDeletePushSubscriptionFunction = {
  Args: { p_endpoint: string };
  Returns: boolean;
};
type AdminSendTestPushFunction = {
  Args: Record<string, never>;
  Returns: "queued" | "no_device" | "not_configured";
};
/** Noms des fichiers sans ligne, de plus d'1 h. */
type AdminGalleryOrphansFunction = {
  Args: Record<string, never>;
  Returns: string[];
};

export type Database = {
  public: {
    Tables: {
      services: ServicesTable;
      admins: AdminsTable;
      locations: LocationsTable;
      gallery_items: GalleryItemsTable;
    };
    Views: Record<never, never>;
    Functions: {
      get_available_slots: GetAvailableSlotsFunction;
      get_available_days: GetAvailableDaysFunction;
      create_booking: CreateBookingFunction;
      get_booking: GetBookingFunction;
      cancel_booking: CancelBookingFunction;
      admin_booking_rules: AdminBookingRulesFunction;
      admin_list_availabilities: AdminListAvailabilitiesFunction;
      admin_create_availability: AdminCreateAvailabilityFunction;
      admin_delete_availability: AdminDeleteAvailabilityFunction;
      admin_list_bookings: AdminListBookingsFunction;
      admin_get_booking: AdminGetBookingFunction;
      admin_cancel_booking: AdminCancelBookingFunction;
      admin_list_gallery_items: AdminListGalleryItemsFunction;
      admin_add_gallery_item: AdminAddGalleryItemFunction;
      admin_set_gallery_item_published: AdminSetGalleryItemPublishedFunction;
      admin_update_gallery_item_alt: AdminUpdateGalleryItemAltFunction;
      admin_move_gallery_item: AdminMoveGalleryItemFunction;
      admin_hide_gallery_item: AdminHideGalleryItemFunction;
      admin_delete_gallery_item: AdminDeleteGalleryItemFunction;
      admin_gallery_orphans: AdminGalleryOrphansFunction;
      admin_save_push_subscription: AdminSavePushSubscriptionFunction;
      admin_delete_push_subscription: AdminDeletePushSubscriptionFunction;
      admin_send_test_push: AdminSendTestPushFunction;
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
