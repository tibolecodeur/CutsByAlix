import { useState, type SubmitEvent } from "react";
import { ErrorMessage } from "@/components/StatusMessage";
import {
  BookingError,
  createBooking,
  type AvailableSlot,
  type BookingErrorCode,
  type BookingReceipt,
} from "@/features/booking/data";
import type { ContactForm } from "@/features/booking/validation";
import { isWithinCancelNotice } from "@/features/booking/notice";
import { BOOKING_RULES } from "@/lib/bookingRules";
import { formatLongDay, formatTime } from "@/lib/dates";
import { BookingSummary } from "@/pages/booking/BookingSummary";
import { StepActions, StepFrame } from "@/pages/booking/StepFrame";

/**
 * Erreurs qui obligent à choisir un autre créneau : on renvoie à l'étape 2, dont la liste se
 * recharge d'elle-même (l'étape est remontée, donc ses créneaux sont relus en base).
 * « slot_unavailable » couvre aussi un lieu changé ou une dispo retirée : on ne dit pas
 * « réservé par quelqu'un d'autre ».
 */
const SLOT_ERRORS: Partial<Record<BookingErrorCode, string>> = {
  slot_unavailable: "Ce créneau n'est plus disponible. Choisis-en un autre.",
  too_soon: `On réserve au plus tard ${BOOKING_RULES.minNoticeHours} h avant. Choisis un créneau plus tard.`,
  too_far: `On réserve au maximum ${BOOKING_RULES.maxAdvanceDays / 7} semaines à l'avance. Choisis un autre créneau.`,
};

/**
 * Messages sobres : « limit_reached » ne confirme pas que ce numéro ou cet email a déjà des
 * rendez-vous (quelqu'un pourrait tester les coordonnées d'un autre).
 */
const OTHER_ERRORS: Partial<Record<BookingErrorCode, string>> = {
  limit_reached:
    "Réservation impossible avec ces coordonnées pour le moment. Si tu as déjà des rendez-vous à venir, garde ton lien d'annulation à portée de main.",
  invalid_input:
    "Certaines informations ne sont pas acceptées. Reviens à l'étape précédente pour vérifier tes coordonnées.",
  // Même clé, autre réservation (ou trop tard pour rejouer) : une nouvelle clé est tirée, le
  // prochain appui envoie une réservation neuve. Rien n'est dit de la réservation existante.
  request_conflict: "La réservation n'a pas pu être confirmée. Réessaie dans un instant.",
};

const DEFAULT_ERROR =
  "La réservation n'a pas pu être envoyée. Vérifie ta connexion, puis réessaie.";

type SummaryStepProps = {
  serviceId: string;
  serviceName: string;
  slot: AvailableSlot;
  contact: ContactForm;
  website: string;
  /** Clé d'idempotence (ADR 0009), demandée à l'envoi : la même à chaque essai de CETTE réservation. */
  getRequestId: () => string | null;
  focusOnMount: boolean;
  onBack: () => void;
  onSlotLost: (message: string) => void;
  /** La base refuse la clé (request_conflict) : le parent en tire une nouvelle. */
  onRequestConflict: () => void;
  onBooked: (receipt: BookingReceipt) => void;
};

/** Étape 5 : récapitulatif, puis envoi de la réservation. */
export function SummaryStep(props: SummaryStepProps) {
  const { slot, contact } = props;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    // Garde-fou contre le double appui : un seul envoi à la fois.
    if (submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      const receipt = await createBooking(
        {
          serviceId: props.serviceId,
          startsAt: slot.startsAt,
          locationId: slot.locationId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          phone: contact.phone,
          email: contact.email,
          website: props.website,
        },
        props.getRequestId(),
      );
      props.onBooked(receipt);
    } catch (caught) {
      const code = caught instanceof BookingError ? caught.code : "unknown";
      const slotMessage = SLOT_ERRORS[code];
      if (slotMessage) {
        props.onSlotLost(slotMessage);
      } else {
        if (code === "request_conflict") props.onRequestConflict();
        setError(OTHER_ERRORS[code] ?? DEFAULT_ERROR);
        setSubmitting(false);
      }
    }
  }

  return (
    <StepFrame number={4} title="Vérifie et confirme" focusOnMount={props.focusOnMount}>
      <BookingSummary
        rows={[
          ["Prestation", props.serviceName],
          ["Date", formatLongDay(slot.startsAt)],
          ["Heure", `${formatTime(slot.startsAt)} – ${formatTime(slot.endsAt)}`],
          ["Lieu", slot.locationLabel],
          ["Nom", `${contact.firstName.trim()} ${contact.lastName.trim()}`],
          ...(contact.phone.trim()
            ? [["Téléphone", contact.phone.trim()] as [string, string]]
            : []),
          ...(contact.email.trim() ? [["Email", contact.email.trim()] as [string, string]] : []),
        ]}
      />
      <p>
        Paiement en liquide, sur place.{" "}
        {isWithinCancelNotice(slot.startsAt, new Date())
          ? `Ce rendez-vous est dans moins de ${BOOKING_RULES.cancelNoticeHours} h : tu ne pourras pas l'annuler en ligne.`
          : `Tu pourras annuler en ligne jusqu'à ${BOOKING_RULES.cancelNoticeHours} h avant le rendez-vous.`}
      </p>
      {/* Pas de lien ici : il ferait quitter le parcours avant la confirmation. Il est sur
          l'écran suivant (ConfirmationStep). */}
      <p>
        L'adresse exacte n'est pas affichée sur le site : une fois réservé, écris à Alix en message
        privé sur Instagram pour la recevoir.
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <form onSubmit={handleSubmit}>
        <StepActions
          onBack={props.onBack}
          submitLabel={submitting ? "Réservation en cours…" : "Confirmer la réservation"}
          submitting={submitting}
        />
      </form>
    </StepFrame>
  );
}
