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
