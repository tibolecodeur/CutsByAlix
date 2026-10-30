/**
 * Logique de l'Edge Function notify-booking, sans dépendance à Deno ni à Supabase : les accès
 * à la base et l'envoi sont injectés (`deps`), ce qui la rend testable par Vitest. `index.ts`
 * se contente de brancher les vraies implémentations.
 *
 * Appelée UNIQUEMENT par la base (trigger sur bookings, via pg_net). Le corps ne contient que le
 * type, l'id et l'horodatage ; l'en-tête `x-notify-signature` porte leur HMAC-SHA256 avec le
 * secret partagé. Le secret lui-même ne voyage jamais (il resterait lisible dans la file de
 * pg_net) : une requête interceptée ne permet que de rejouer CET évènement, 5 min au plus.
 */
import type { PushResult, PushSubscription } from "../_shared/webpush.ts";
import {
  buildBookingMessage,
  buildOverflowMessage,
  buildTestMessage,
  type BookingEventKind,
  type PushMessage,
} from "./message.ts";

export type BookingRow = {
  status: string;
  cancelled_by: string | null;
  starts_at: string;
  first_name: string;
  service_name: string;
};

export type NotifyDeps = {
  /** Secret partagé avec la base (Vault). Vide : la fonction refuse tout. */
  secret: string;
  /** Heure courante en secondes (remplaçable en test). */
  nowSeconds?: () => number;
  getBooking: (id: string) => Promise<BookingRow | null>;
  listSubscriptions: () => Promise<PushSubscription[]>;
  forgetSubscription: (endpoint: string) => Promise<void>;
  send: (subscription: PushSubscription, payload: string) => Promise<PushResult>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparaison en temps constant : la durée ne révèle pas combien de caractères sont justes. */
export function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Event = { kind: BookingEventKind; bookingId: string | null; ts: number };

/** Signature acceptée de -60 s (horloges décalées) à +5 min (file de pg_net chargée). */
const MAX_AGE_S = 300;
const MAX_FUTURE_S = 60;

function parseEvent(value: unknown): Event | null {
  if (!value || typeof value !== "object") return null;
  const { kind, booking_id: bookingId, ts } = value as Record<string, unknown>;
  if (typeof ts !== "number" || !Number.isSafeInteger(ts)) return null;
  if ((kind === "test" || kind === "overflow") && bookingId === null) {
    return { kind, bookingId: null, ts };
  }
  if (
    (kind === "new_booking" || kind === "cancelled") &&
    typeof bookingId === "string" &&
    UUID.test(bookingId)
  ) {
    return { kind, bookingId, ts };
  }
  return null;
}

/** HMAC-SHA256 en hexadécimal, comme `encode(hmac(…, 'sha256'), 'hex')` côté base. */
export async function signEvent(
  secret: string,
  kind: string,
  bookingId: string | null,
  ts: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${kind}:${bookingId ?? ""}:${ts}`),
  );
  return Array.from(new Uint8Array(mac), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Le RDV correspond-il encore à l'évènement ? (Une réservation annulée dans la seconde qui suit
 * ne doit pas être annoncée comme « nouvelle ».)
 */
function stillRelevant(kind: BookingEventKind, booking: BookingRow): boolean {
  if (kind === "new_booking") return booking.status === "confirmed";
  return booking.status === "cancelled" && booking.cancelled_by === "client";
}

export async function handleNotify(request: Request, deps: NotifyDeps): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (deps.secret.length < 16) return json(401, { error: "unauthorized" });

  let event: Event | null;
  try {
    event = parseEvent(await request.json());
  } catch {
    event = null;
  }
  if (!event) return json(400, { error: "invalid_input" });

  // Authenticité : signature juste ET récente. Aucune lecture en base avant ce contrôle.
  const now = (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))();
  const given = request.headers.get("x-notify-signature") ?? "";
  const expected = await signEvent(deps.secret, event.kind, event.bookingId, event.ts);
  const fresh = event.ts <= now + MAX_FUTURE_S && event.ts >= now - MAX_AGE_S;
  if (!safeEqual(given, expected) || !fresh) return json(401, { error: "unauthorized" });

  let message: PushMessage;
  if (event.kind === "test") {
    message = buildTestMessage();
  } else if (event.kind === "overflow") {
    message = buildOverflowMessage();
  } else {
    const booking = await deps.getBooking(event.bookingId!);
    if (!booking || !stillRelevant(event.kind, booking))
      return json(200, { sent: 0, skipped: true });
    message = buildBookingMessage(event.kind, {
      id: event.bookingId!,
      startsAt: booking.starts_at,
      firstName: booking.first_name,
      serviceName: booking.service_name,
    });
  }

  const payload = JSON.stringify(message);
  const subscriptions = await deps.listSubscriptions();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  // Un appareil en panne n'empêche pas les autres d'être prévenus.
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const result = await deps.send(subscription, payload);
        if (result.gone) {
          await deps.forgetSubscription(subscription.endpoint);
          removed++;
        } else if (result.status >= 200 && result.status < 300) {
          sent++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }),
  );
  return json(200, { sent, removed, failed });
}
