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
export function fakeSupabaseClient(
  result: FakeQueryResult | Record<string, FakeQueryResult>,
  storageResults: FakeStorageResults = {},
) {
  const calls: { method: string; args: unknown[] }[] = [];
  // Nom de la dernière table ou RPC visée : sert à choisir la réponse quand `result` est un
  // dictionnaire ({ admin_list_gallery_items: …, admin_delete_gallery_item: … }).
  let target = "";
  const pick = (): FakeQueryResult =>
    "data" in result && "error" in result
      ? (result as FakeQueryResult)
      : ((result as Record<string, FakeQueryResult>)[target] ?? {
          data: null,
          error: { message: `réponse non simulée : ${target}` },
        });
  const builder: Record<string, unknown> = {
    then: (resolve: (value: FakeQueryResult) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(pick()).then(resolve, reject),
  };
  for (const method of ["from", "select", "eq", "order", "rpc", "abortSignal"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      if (method === "from" || method === "rpc") target = String(args[0]);
      return builder;
    };
  }
  // API Storage : `storage.from(bucket).upload(...)` etc., notée « storage.upload ».
  const bucket: Record<string, unknown> = {};
  for (const method of ["upload", "remove", "createSignedUrls"] as const) {
    bucket[method] = (...args: unknown[]) => {
      calls.push({ method: `storage.${method}`, args });
      return Promise.resolve(storageResults[method] ?? { data: null, error: null });
    };
  }
  builder.storage = {
    from: (...args: unknown[]) => {
      calls.push({ method: "storage.from", args });
      return bucket;
    },
  };
  return { client: builder as unknown as SupabaseClient<Database>, calls };
}

/** Réponses simulées de l'API Storage (par défaut : `{ data: null, error: null }`). */
export type FakeStorageResults = Partial<
  Record<"upload" | "remove" | "createSignedUrls", FakeQueryResult>
>;

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
