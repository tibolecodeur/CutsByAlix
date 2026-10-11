import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, ButtonAnchor } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { ErrorMessage, LoadingMessage, SuccessMessage } from "@/components/StatusMessage";
import {
  canBarberCancel,
  cancelledLabel,
  formatPhone,
  mailtoHref,
} from "@/features/admin/bookings";
import {
  AdminError,
  cancelAdminBooking,
  getAdminBooking,
  type AdminBookingDetails,
} from "@/features/admin/data";
import { isUuid } from "@/features/booking/data";
import { formatLongDay, formatTime } from "@/lib/dates";
import { useAsync } from "@/lib/useAsync";

const CANCEL_ERRORS: Partial<Record<string, string>> = {
  already_started: "Ce rendez-vous a déjà commencé : il ne peut plus être annulé.",
  not_found: "Ce rendez-vous n'existe plus. Reviens à la liste.",
  forbidden: "Ton compte n'a pas accès à cette action. Reconnecte-toi.",
};

/** Message d'annulation : uniquement des textes fixes, jamais le message d'origine. */
function cancelErrorMessage(caught: unknown): string {
  return (
    (caught instanceof AdminError && CANCEL_ERRORS[caught.code]) ||
    "L'annulation n'a pas pu être envoyée. Vérifie ta connexion, puis réessaie."
  );
}

/**
 * Détail d'un rendez-vous : le seul écran qui charge le téléphone et l'e-mail du client.
 * L'URL ne contient que l'identifiant technique (uuid), jamais une donnée du client ; le titre
 * de la page reste fixe (il apparaît dans l'historique et les onglets).
 */
export function AdminBookingDetailPage() {
  const { id = "" } = useParams();
  const valid = isUuid(id);
  const booking = useAsync(valid ? `admin-booking|${id}` : null, () => getAdminBooking(id));
  // Gardé ICI et non dans BookingDetails : après l'annulation, `reload()` repasse par
  // « chargement », ce qui démonte BookingDetails (et effacerait son état local).
  const [justCancelled, setJustCancelled] = useState(false);
  const notFound =
    !valid ||
    (booking.status === "error" &&
      booking.error instanceof AdminError &&
      booking.error.code === "not_found");

  return (
    <>
      <PageMeta title="Détail du rendez-vous" description="Détail d'un rendez-vous client." />
      <Section variant="blush">
        <p>
          <Link to="/admin/rendez-vous" className="link inline-flex min-h-tap items-center">
            ← Tous les rendez-vous
          </Link>
        </p>
        <h1>Rendez-vous</h1>
      </Section>
      <Section>
        {notFound && (
          <ErrorMessage>Ce rendez-vous n'existe pas ou n'est plus disponible.</ErrorMessage>
        )}
        {!notFound && booking.status === "loading" && (
          <LoadingMessage>Chargement du rendez-vous…</LoadingMessage>
        )}
        {!notFound && booking.status === "error" && (
          <ErrorMessage onRetry={booking.reload}>
            Impossible de charger le rendez-vous. Vérifie ta connexion, puis réessaie.
          </ErrorMessage>
        )}
        {booking.status === "success" && (
          <BookingDetails
            booking={booking.data}
            justCancelled={justCancelled}
            onCancelled={() => {
              setJustCancelled(true);
              booking.reload();
            }}
          />
        )}
      </Section>
    </>
  );
}

function BookingDetails({
  booking,
  justCancelled,
  onCancelled,
}: {
  booking: AdminBookingDetails;
  justCancelled: boolean;
  onCancelled: () => void;
}) {
  const cancelled = booking.status === "cancelled";
  const successRef = useRef<HTMLDivElement>(null);

  // Après l'annulation, le bouton touché disparaît : le focus va au message de confirmation.
  useEffect(() => {
    if (justCancelled && cancelled) successRef.current?.focus();
  }, [justCancelled, cancelled]);

  return (
    <Card as="article">
      <p className="text-xl font-bold first-letter:uppercase">{formatLongDay(booking.startsAt)}</p>
      <p className={cancelled ? "text-lg line-through" : "text-lg"}>
        {formatTime(booking.startsAt)} – {formatTime(booking.endsAt)}
      </p>
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

      <h2 className="mt-4 text-2xl">
        {booking.firstName} {booking.lastName}
      </h2>
      {booking.phone && <p>{formatPhone(booking.phone)}</p>}
      {booking.email && <p className="break-all">{booking.email}</p>}
      <div className="flex flex-col gap-3 sm:flex-row">
        {booking.phone && (
          <>
            <ButtonAnchor href={`tel:${booking.phone}`}>Appeler</ButtonAnchor>
            <ButtonAnchor href={`sms:${booking.phone}`} variant="secondary">
              SMS
            </ButtonAnchor>
          </>
        )}
        {booking.email && (
          <ButtonAnchor href={mailtoHref(booking.email)} variant="secondary">
            E-mail
          </ButtonAnchor>
        )}
      </div>

      {justCancelled && cancelled && (
        <div ref={successRef} tabIndex={-1} className="mt-4">
          <SuccessMessage>
            Rendez-vous annulé, le créneau est de nouveau proposé aux clients. Le client n'est pas
            prévenu : contacte {booking.firstName}.
          </SuccessMessage>
        </div>
      )}
      {canBarberCancel(booking, new Date()) && (
        <CancelBooking booking={booking} onCancelled={onCancelled} />
      )}
    </Card>
  );
}

type Step = "idle" | "confirming" | "cancelling";

function CancelBooking({
  booking,
  onCancelled,
}: {
  booking: AdminBookingDetails;
  onCancelled: () => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>();
  // Garde contre le double appui : le bouton n'est désactivé qu'au rendu suivant, une `ref`
  // change tout de suite. La base renvoie aussi `false` (sans erreur) si c'est déjà annulé.
  const sending = useRef(false);
  const cancelling = step === "cancelling";
  const moment = `${formatLongDay(booking.startsAt)} à ${formatTime(booking.startsAt)}`;

  async function handleCancel() {
    if (sending.current) return;
    sending.current = true;
    setStep("cancelling");
    setError(undefined);
    try {
      await cancelAdminBooking(booking.id);
      onCancelled();
    } catch (caught) {
      setError(cancelErrorMessage(caught));
      setStep("confirming");
    } finally {
      sending.current = false;
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {step === "idle" ? (
        <p>
          <Button variant="secondary" onClick={() => setStep("confirming")}>
            Annuler le rendez-vous
          </Button>
        </p>
      ) : (
        <>
          {/* Confirmation explicite : l'annulation est définitive et le client n'est pas prévenu. */}
          <p className="font-semibold">
            Annuler le rendez-vous de {booking.firstName} le {moment} ? Le client n'est pas prévenu
            : contacte-le.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => setStep("idle")} disabled={cancelling}>
              Garder le rendez-vous
            </Button>
            <Button
              onClick={handleCancel}
              disabled={cancelling}
              aria-busy={cancelling || undefined}
            >
              {cancelling ? "Annulation en cours…" : "Oui, annuler"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
