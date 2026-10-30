/**
 * Logique de l'Edge Function notify-booking, sans dépendance à Deno ni à Supabase : les accès
 * à la base et l'envoi sont injectés (`deps`), ce qui la rend testable par Vitest. `index.ts`
 * se contente de brancher les vraies implémentations.
 *
 * Appelée UNIQUEMENT par la base (trigger sur bookings, via pg_net), avec le secret partagé
 * dans l'en-tête `x-notify-secret`. Le corps ne contient que le type et l'id.
 */
import type { PushResult, PushSubscription } from "../_shared/webpush.ts";
import {
  buildBookingMessage,
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

type Event = { kind: BookingEventKind; bookingId: string | null };

function parseEvent(value: unknown): Event | null {
  if (!value || typeof value !== "object") return null;
  const { kind, booking_id: bookingId } = value as Record<string, unknown>;
  if (kind === "test") return { kind, bookingId: null };
  if (
    (kind === "new_booking" || kind === "cancelled") &&
    typeof bookingId === "string" &&
    UUID.test(bookingId)
  ) {
    return { kind, bookingId };
  }
  return null;
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
  const given = request.headers.get("x-notify-secret") ?? "";
  if (deps.secret.length < 16 || !safeEqual(given, deps.secret)) {
    return json(401, { error: "unauthorized" });
  }

  let event: Event | null;
  try {
    event = parseEvent(await request.json());
  } catch {
    event = null;
  }
  if (!event) return json(400, { error: "invalid_input" });

  let message: PushMessage;
  if (event.kind === "test") {
    message = buildTestMessage();
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
