/**
 * Edge Function notify-booking (Deno, Supabase). Branche les vraies dépendances sur
 * `handleNotify` (handler.ts, testé par Vitest).
 *
 * Secrets de la fonction (`supabase secrets set`, docs/DEPLOIEMENT.md § Notifications) :
 *   NOTIFY_BOOKING_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 * SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase à toute fonction : la
 * clé service_role ne sort jamais du serveur (elle n'apparaît ni dans src/ ni dans git).
 * La fonction n'appelle que les 3 fonctions SQL réservées à service_role (notify_*).
 */
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { sendPush, type PushSubscription } from "../_shared/webpush.ts";
import { handleNotify, type BookingRow } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const vapid = {
  publicKey: env("VAPID_PUBLIC_KEY"),
  privateKey: env("VAPID_PRIVATE_KEY"),
  subject: env("VAPID_SUBJECT"),
};

Deno.serve((request) =>
  handleNotify(request, {
    secret: env("NOTIFY_BOOKING_SECRET"),
    async getBooking(id) {
      const { data, error } = await supabase.rpc("notify_booking_payload", { p_booking_id: id });
      if (error) throw new Error("booking_unavailable");
      return ((data as BookingRow[] | null) ?? [])[0] ?? null;
    },
    async listSubscriptions() {
      const { data, error } = await supabase.rpc("notify_push_subscriptions");
      if (error) throw new Error("subscriptions_unavailable");
      return (data as PushSubscription[] | null) ?? [];
    },
    async forgetSubscription(endpoint) {
      await supabase.rpc("notify_forget_push_subscription", { p_endpoint: endpoint });
    },
    send: (subscription, payload) => sendPush(subscription, payload, vapid),
  }).catch(() => new Response(JSON.stringify({ error: "internal" }), { status: 500 })),
);
