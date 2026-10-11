import { Link } from "react-router";
import { Card } from "@/components/Card";
import { cancelledLabel } from "@/features/admin/bookings";
import type { AdminBooking } from "@/features/admin/data";
import { formatLongDay, formatTime } from "@/lib/dates";

/**
 * Un rendez-vous dans une liste : heure, client, prestation et ville. Pas de téléphone ni
 * d'e-mail ici (ils ne sont chargés qu'au détail) ; toute la ligne du haut mène au détail.
 */
export function AdminBookingCard({
  booking,
  showDay = false,
}: {
  booking: AdminBooking;
  showDay?: boolean;
}) {
  const cancelled = booking.status === "cancelled";
  const hours = `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)}`;
  return (
    <Card as="li">
      <Link
        to={`/admin/rendez-vous/${booking.id}`}
        className="link flex min-h-tap flex-col justify-center"
      >
        <span className={cancelled ? "text-xl font-bold line-through" : "text-xl font-bold"}>
          {showDay && (
            <span className="first-letter:uppercase">{formatLongDay(booking.startsAt)}, </span>
          )}
          {hours}
        </span>
        <span className="font-semibold">
          {booking.firstName} {booking.lastName}
        </span>
      </Link>
      <p className="text-muted">
        {booking.serviceName} · {booking.locationLabel}
      </p>
      {cancelled && (
        <p>
          <span className="border border-ink px-2 text-sm font-semibold">
            {cancelledLabel(booking.cancelledBy)}
          </span>
        </p>
      )}
    </Card>
  );
}
