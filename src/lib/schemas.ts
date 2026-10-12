import { z } from "zod";

// Zod 4 compile ses validations en code (`new Function(…)`) pour aller plus vite, après avoir
// vérifié au démarrage que c'est permis. Notre CSP interdit `eval` (public/_headers) : sans
// ceci, chaque page signalerait une violation `script-src 'unsafe-eval'` à chaque chargement.
// `jitless` désactive cette compilation : validation un peu plus lente (négligeable ici, des
// formulaires de quelques champs) et aucune violation. Ce fichier est le SEUL à importer Zod
// (un test le vérifie) : la ligne s'exécute donc avant la création du moindre schéma.
z.config({ jitless: true });

// Schémas Zod partagés entre les formulaires et les appels à Supabase. Ils ne font que prévenir
// l'utilisateur avant l'envoi : la base revalide toujours tout.

/**
 * Formulaire « Ajouter une plage » (admin). Jour ISO « yyyy-MM-dd » et heures « HH:mm » (heure
 * de Paris, telles que les donnent les champs date et heure), lieu choisi parmi les lieux actifs.
 * Comparer les heures en texte fonctionne car « HH:mm » est à largeur fixe.
 */
export const availabilityFormSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_input"),
    from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_input"),
    to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_input"),
    locationId: z.uuid("location_required"),
  })
  .refine((form) => form.to > form.from, { message: "invalid_range", path: ["to"] });

export type AvailabilityForm = z.infer<typeof availabilityFormSchema>;

// ---------------------------------------------------------------------------------------------
// Réponses de Supabase pour le parcours client (C-02 de l'audit) : on ne croit pas la réponse
// sur parole. Une réponse vide, mal formée ou de forme inattendue (proxy, panne, version de la
// base différente) est refusée ici, et l'écran affiche une erreur avec « Réessayer » au lieu
// d'un faux succès. Comparable à la désérialisation stricte d'un DTO en Symfony/Java.
// ---------------------------------------------------------------------------------------------

/** Horodatage ISO 8601 avec fuseau (« …Z » ou « …+00:00 », format renvoyé par PostgREST). */
const isoDateTime = z.iso.datetime({ offset: true });
/** Forme d'un uuid, sans exiger de version (même règle que `isUuid` de booking/data.ts). */
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const label = z.string().min(1);

/** Table `services` (colonnes lisibles par anon). */
export const serviceRowsSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: label,
    duration_min: z.number().int().positive(),
    price_label: z.string().nullable(),
  }),
);

/** RPC `get_available_slots`. */
export const availableSlotRowsSchema = z.array(
  z.object({
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    location_id: z.string().min(1),
    location_label: label,
  }),
);

/** RPC `create_booking` : exactement UNE ligne, avec un jeton d'annulation bien formé. */
export const bookingReceiptRowsSchema = z
  .array(
    z.object({
      starts_at: isoDateTime,
      ends_at: isoDateTime,
      service_name: label,
      location_label: label,
      cancel_token: uuidLike,
    }),
  )
  .length(1);

/** RPC `get_booking` : zéro ligne (lien invalide ou expiré) ou une seule. */
export const bookingDetailsRowsSchema = z
  .array(
    z.object({
      status: z.enum(["confirmed", "cancelled"]),
      starts_at: isoDateTime,
      ends_at: isoDateTime,
      service_name: label,
      location_label: label,
      first_name: label,
      can_cancel: z.boolean(),
      cancelled_by: z.enum(["client", "barber"]).nullable(),
    }),
  )
  .max(1);

/** RPC `cancel_booking` : un booléen, rien d'autre (ni null, ni objet). */
export const cancelResultSchema = z.boolean();

/**
 * Récapitulatif gardé dans `sessionStorage` pour survivre à un rechargement (C-03). Relu depuis
 * le navigateur : on le valide comme une réponse réseau. Aucune donnée personnelle (ni nom, ni
 * téléphone, ni e-mail).
 */
export const storedReceiptSchema = z.strictObject({
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  serviceName: label,
  locationLabel: label,
  cancelToken: uuidLike,
});
