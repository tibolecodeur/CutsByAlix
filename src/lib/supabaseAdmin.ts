import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readSupabaseConfig } from "@/lib/supabase";

/**
 * Client Supabase de l'ESPACE ADMIN, distinct du client public (`src/lib/supabase.ts`).
 *
 * Le client public n'a jamais de session. Celui-ci en garde une, pour qu'Alix reste connectée
 * sur son téléphone après fermeture du navigateur : comme un cookie « se souvenir de moi » en
 * Symfony, mais ici c'est supabase-js qui range les jetons dans le localStorage et rafraîchit
 * tout seul le jeton d'accès (valable 1 h) grâce au jeton de rafraîchissement.
 *
 * Clé de stockage DÉDIÉE : les deux clients ne lisent jamais la même session. Seule
 * `src/features/admin/` l'utilise.
 *
 * Risque connu : un script injecté dans la page pourrait lire le localStorage (XSS). Parades :
 * aucun script tiers, rendu React (pas de HTML injecté), rotation des jetons de
 * rafraîchissement côté Supabase ; CSP prévue (docs/PLAN.md).
 */
export const ADMIN_AUTH_STORAGE_KEY = "cutsbyalix-admin-auth";

let client: SupabaseClient<Database> | null = null;

/** Le client admin, ou une `SupabaseConfigError` si une variable manque. */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (client) return client;

  const { url, anonKey } = readSupabaseConfig();
  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Aucun lien magique ni fournisseur externe : on n'attend jamais de jeton dans l'URL.
      detectSessionInUrl: false,
      storageKey: ADMIN_AUTH_STORAGE_KEY,
      storage: globalThis.localStorage,
    },
  });
  return client;
}

/** Oublie le client créé (tests). */
export function resetSupabaseAdminClient(): void {
  client = null;
}
