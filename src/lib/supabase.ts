import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Client Supabase PUBLIC (visiteurs non connectés), créé au premier usage.
 *
 * Les variables doivent commencer par `VITE_` pour que Vite les expose au navigateur.
 * Seule la clé « anon » (publique) a le droit d'être ici : la clé `service_role` donnerait
 * un accès total à la base et contournerait la RLS. Voir .env.example.
 *
 * Variable manquante : on ne plante PAS au chargement du module (tout le site tomberait,
 * même les pages sans base). L'erreur part seulement à l'appel, et l'écran concerné affiche
 * son message d'erreur.
 */

export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Variables Supabase manquantes : copie .env.example en .env.local et renseigne " +
        "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.",
    );
    this.name = "SupabaseConfigError";
  }
}

let client: SupabaseClient<Database> | null = null;

/**
 * URL du projet et clé « anon », lues dans les variables d'environnement. Partagées par le
 * client public (ici) et le client admin (`src/lib/supabaseAdmin.ts`).
 * Lève une `SupabaseConfigError` si l'une manque.
 */
export function readSupabaseConfig(): { url: string; anonKey: string } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new SupabaseConfigError();
  return { url, anonKey };
}

/**
 * Le client public, ou une `SupabaseConfigError` si une variable manque.
 * Sans session : il est réservé aux visiteurs, y compris pour /annuler. Les RPC publiques ne sont
 * exécutables que par `anon` ; le client admin (`getSupabaseAdmin`, avec session) ne doit jamais
 * les appeler, et ce client-ci ne sert jamais à l'admin.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const { url, anonKey } = readSupabaseConfig();
  client = createClient<Database>(url, anonKey, {
    // Côté public, personne ne se connecte : aucune session gardée dans le localStorage,
    // aucun rafraîchissement de jeton, aucune lecture de jeton dans l'URL. L'admin a son propre
    // client, avec session (src/lib/supabaseAdmin.ts).
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

/** Oublie le client créé (tests : changer les variables entre deux cas). */
export function resetSupabaseClient(): void {
  client = null;
}
