import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Réponse d'une requête supabase-js : `{ data, error }`, jamais d'exception. */
export type FakeQueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

/**
 * Client Supabase SIMULÉ pour Vitest : aucune requête réseau. Chaque méthode du constructeur
 * de requête (`from`, `select`, `rpc`, `order`…) est notée dans `calls` puis renvoie le même
 * objet, comme la vraie API chaînable. `await` sur la chaîne renvoie `result`.
 *
 * Astuce JS : `await x` appelle `x.then(...)` si cette méthode existe (« thenable »). C'est ainsi
 * que supabase-js n'envoie la requête qu'au moment de l'`await`.
 */
export function fakeSupabaseClient(result: FakeQueryResult) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: FakeQueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ["from", "select", "eq", "order", "rpc", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return { client: builder as unknown as SupabaseClient<Database>, calls };
}

/** Deux prestations telles que les renvoie la table `services` (colonnes sélectionnées). */
export const SERVICE_ROWS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Coupe",
    duration_min: 60,
    price_label: null,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Coupe + barbe",
    duration_min: 60,
    price_label: "20 €",
  },
];
