import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Button, ButtonLink } from "@/components/Button";
import { InstagramLink } from "@/components/InstagramLink";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import {
  BookingError,
  cancelBooking,
  getBooking,
  type BookingDetails,
} from "@/features/booking/data";
import { BOOKING_RULES } from "@/lib/bookingRules";
import { formatLongDay, formatTime } from "@/lib/dates";
import { useAsync } from "@/lib/useAsync";
import { BookingSummary } from "@/pages/booking/BookingSummary";

/**
 * Annulation via le lien personnel `/annuler#<jeton>` (jamais via l'id du RDV).
 * États : lien valide (détail + bouton), déjà annulé, annulé par Alix, trop tard, lien
 * invalide ; plus chargement et erreur réseau. « Lien invalide » est la réponse unique pour un jeton absent,
 * mal formé, inconnu OU expiré (RDV terminé) : la base ne les distingue pas, l'écran non plus.
 *
 * Le jeton est dans le FRAGMENT de l'URL (après le `#`), pas dans la query : un fragment n'est
 * jamais envoyé au serveur, ni recopié dans l'en-tête Referer, ni écrit dans les journaux de
 * l'hébergeur (équivalent côté PHP : une ancre `#` n'arrive jamais dans `$_SERVER`). L'ancien
 * format `?token=` n'existe plus : il donne « Lien invalide » sans requête.
 * Le jeton n'est écrit nulle part (ni console, ni message d'erreur) et ne part que dans le
 * corps des requêtes à Supabase. Par précaution, la page demande aussi `no-referrer` et
 * `noindex`, comme `public/_headers` côté hébergeur.
 */
export function CancelPage() {
  // `location.hash` vaut « #<jeton> » : on retire le « # ». Le jeton vit dans l'état du routeur
  // (en mémoire) le temps de la page ; il n'est ni copié ailleurs ni journalisé.
  const token = useLocation().hash.slice(1);
  const booking = useAsync(token === "" ? null : `booking|${token}`, () => getBooking(token));

  return (
    <>
      <PageMeta
        title="Annuler ma réservation"
        description="Annule ton rendez-vous CutsByAlix grâce au lien personnel reçu lors de la réservation."
        noindex
        noReferrer
      />
      <Section>
        <h1>Annuler ma réservation</h1>
      </Section>
      <Section>
        {booking.status === "idle" && <InvalidLink />}
        {booking.status === "loading" && (
          <LoadingMessage>Chargement de ton rendez-vous…</LoadingMessage>
        )}
        {booking.status === "error" && (
          <ErrorMessage onRetry={booking.reload}>
            Impossible de charger ton rendez-vous. Vérifie ta connexion, puis réessaie.
          </ErrorMessage>
        )}
        {booking.status === "success" &&
          (booking.data === null ? (
            <InvalidLink />
          ) : (
            // `key` : si le lien change, on repart d'un état d'annulation neuf.
            <BookingCancellation key={token} token={token} booking={booking.data} />
          ))}
      </Section>
    </>
  );
}

/**
 * `already` : la base répond `false` (RDV déjà annulé entre-temps, par Alix ou par un premier
 * essai dont la réponse s'est perdue). Ce n'est pas « C'est annulé » : on dit ce qui est vrai.
 */
type Outcome =
  "idle" | "confirming" | "cancelling" | "cancelled" | "already" | "too_late" | "error";

function BookingCancellation({ token, booking }: { token: string; booking: BookingDetails }) {
  const [outcome, setOutcome] = useState<Outcome>("idle");
  // Garde contre le double appui : le bouton est désactivé au rendu suivant, mais deux clics
  // très rapprochés pourraient passer avant. Une `ref` change tout de suite (sans rendu).
  const sending = useRef(false);
  // Après une action, l'écran change : le titre du nouvel état reçoit le focus.
  const hasActed = outcome !== "idle" && outcome !== "confirming";

  async function handleCancel() {
    if (sending.current) return;
    sending.current = true;
    setOutcome("cancelling");
    try {
      // false = déjà annulé (autre onglet, Alix, ou rejeu après une coupure) : on le dit.
      // Réponse vide ou inattendue : erreur (invalid_response), jamais un faux « annulé ».
      const cancelled = await cancelBooking(token);
      setOutcome(cancelled ? "cancelled" : "already");
    } catch (caught) {
      setOutcome(
        caught instanceof BookingError && caught.code === "too_late" ? "too_late" : "error",
      );
    } finally {
      sending.current = false;
    }
  }

  if (outcome === "cancelled") {
    return (
      <StateBlock title="C'est annulé" focusTitle>
        <p>
          Ton rendez-vous du {formatLongDay(booking.startsAt)} à {formatTime(booking.startsAt)} est
          annulé. Le créneau est libéré pour quelqu'un d'autre.
        </p>
        <BookAgain />
      </StateBlock>
    );
  }
  if (outcome === "already") {
    return (
      <StateBlock title="Rendez-vous déjà annulé" focusTitle>
        <p>
          Ce rendez-vous du {formatLongDay(booking.startsAt)} à {formatTime(booking.startsAt)} a
          déjà été annulé. Tu n'as rien d'autre à faire.
        </p>
        <BookAgain />
      </StateBlock>
    );
  }
  if (booking.status === "cancelled" && booking.cancelledBy === "barber") {
    return (
      <StateBlock title="Rendez-vous annulé par Alix">
        <p>
          Alix a annulé ton rendez-vous du {formatLongDay(booking.startsAt)} à{" "}
          {formatTime(booking.startsAt)}. Pour en reprendre un, choisis un nouveau créneau.
        </p>
        <BookAgain />
      </StateBlock>
    );
  }
  if (booking.status === "cancelled") {
    return (
      <StateBlock title="Rendez-vous déjà annulé">
        <p>
          Ce rendez-vous du {formatLongDay(booking.startsAt)} à {formatTime(booking.startsAt)} a
          déjà été annulé. Tu n'as rien d'autre à faire.
        </p>
        <BookAgain />
      </StateBlock>
    );
  }
  if (!booking.canCancel || outcome === "too_late") {
    return (
      <StateBlock title="Trop tard pour annuler en ligne" focusTitle={hasActed}>
        <p>
          L'annulation en ligne est possible jusqu'à {BOOKING_RULES.cancelNoticeHours} h avant le
          rendez-vous. Ton rendez-vous du {formatLongDay(booking.startsAt)} à{" "}
          {formatTime(booking.startsAt)} est donc maintenu. Il est trop tard pour annuler en ligne :
          contacte Alix directement sur Instagram.
        </p>
        <p>
          <InstagramLink />
        </p>
      </StateBlock>
    );
  }

  const cancelling = outcome === "cancelling";
  return (
    <StateBlock title={`${booking.firstName}, ton rendez-vous`}>
      <BookingSummary
        rows={[
          ["Prestation", booking.serviceName],
          ["Date", formatLongDay(booking.startsAt)],
          ["Heure", `${formatTime(booking.startsAt)} – ${formatTime(booking.endsAt)}`],
          ["Lieu", booking.locationLabel],
        ]}
      />
      <p>Tu ne peux plus venir ? Annule ici pour libérer le créneau.</p>
      {outcome === "error" && (
        <ErrorMessage>
          L'annulation n'a pas pu être envoyée. Vérifie ta connexion, puis réessaie.
        </ErrorMessage>
      )}
      {/* Annulation en deux temps : définitive, elle ne doit pas partir sur un appui malheureux. */}
      {outcome === "confirming" || outcome === "error" || cancelling ? (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">L'annulation est définitive. Tu confirmes ?</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => setOutcome("idle")} disabled={cancelling}>
              Garder mon rendez-vous
            </Button>
            <Button
              onClick={handleCancel}
              disabled={cancelling}
              aria-busy={cancelling || undefined}
            >
              {cancelling ? "Annulation en cours…" : "Oui, annuler"}
            </Button>
          </div>
        </div>
      ) : (
        <p>
          <Button onClick={() => setOutcome("confirming")} className="w-full sm:w-auto">
            Annuler mon rendez-vous
          </Button>
        </p>
      )}
    </StateBlock>
  );
}

function InvalidLink() {
  return (
    <StateBlock title="Lien invalide">
      <p>
        Ce lien d'annulation n'est pas valide ou n'est plus actif. Vérifie que tu as bien copié le
        lien en entier, tel qu'il s'est affiché après ta réservation.
      </p>
      <BookAgain />
    </StateBlock>
  );
}

type StateBlockProps = {
  title: string;
  /** Place le focus sur le titre : après une action, le bouton touché a disparu. */
  focusTitle?: boolean;
  children: ReactNode;
};

function StateBlock({ title, focusTitle = false, children }: StateBlockProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  return (
    <div className="flex flex-col gap-5">
      <h2 ref={titleRef} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function BookAgain() {
  return (
    <p>
      <ButtonLink to="/reserver" className="w-full sm:w-auto">
        Réserver un créneau
      </ButtonLink>
    </p>
  );
}
