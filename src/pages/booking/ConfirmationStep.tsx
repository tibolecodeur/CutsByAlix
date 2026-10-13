import { useState } from "react";
import { Link } from "react-router";
import { Button, ButtonLink } from "@/components/Button";
import { InstagramLink } from "@/components/InstagramLink";
import type { BookingReceipt } from "@/features/booking/data";
import { isWithinCancelNotice } from "@/features/booking/notice";
import { BOOKING_RULES } from "@/lib/bookingRules";
import { LOCATION_NOTICE } from "@/lib/contact";
import { formatLongDay, formatTime } from "@/lib/dates";
import { BookingSummary } from "@/pages/booking/BookingSummary";
import { StepFrame } from "@/pages/booking/StepFrame";

type ConfirmationStepProps = {
  receipt: BookingReceipt;
  focusOnMount: boolean;
};

/**
 * Réservation confirmée : récap (date, heure de Paris, prestation, localité), contact Instagram
 * pour obtenir le lieu exact (adresse jamais stockée, ADR 0008) et lien personnel
 * d'annulation. Aucune mention de paiement sur /reserver (consigne 27). Le jeton
 * n'est affiché qu'ici, jamais écrit dans la console ni ajouté à un lien sortant.
 */
export function ConfirmationStep({ receipt, focusOnMount }: ConfirmationStepProps) {
  // Le jeton est dans le fragment (#) : il ne part jamais vers un serveur ni dans un Referer.
  const cancelPath = `/annuler#${receipt.cancelToken}`;
  const cancelUrl = `${window.location.origin}${cancelPath}`;

  return (
    <StepFrame title="C'est réservé !" focusOnMount={focusOnMount}>
      <p role="status" className="text-lg">
        Ton rendez-vous est confirmé. Merci et à bientôt !
      </p>
      <BookingSummary
        rows={[
          ["Prestation", receipt.serviceName],
          ["Date", formatLongDay(receipt.startsAt)],
          ["Heure", `${formatTime(receipt.startsAt)} – ${formatTime(receipt.endsAt)}`],
          ["Lieu", receipt.locationLabel],
        ]}
      />

      {isWithinCancelNotice(receipt.startsAt, new Date()) && (
        // Pas d'alerte : l'information est donnée à la lecture de la page, sans interrompre.
        <p className="font-semibold">
          Ton rendez-vous est dans moins de {BOOKING_RULES.cancelNoticeHours} h : tu ne pourras pas
          l'annuler en ligne. Si tu as un empêchement, contacte Alix directement sur Instagram (lien
          plus bas).
        </p>
      )}

      <section aria-labelledby="cancel-link-title" className="flex flex-col gap-3">
        <h3 id="cancel-link-title">Ton lien d'annulation</h3>
        <p className="font-semibold">
          Tu ne recevras pas d'e-mail de confirmation : copie ce lien ou fais une capture d'écran de
          cette page.
        </p>
        <p>
          C'est le seul moyen d'annuler en ligne, jusqu'à {BOOKING_RULES.cancelNoticeHours} h avant
          le rendez-vous. Ne le partage pas.
        </p>
        <p
          id="cancel-link-url"
          className="border border-ink/15 bg-surface p-3 text-sm break-all select-all"
        >
          {cancelUrl}
        </p>
        <CopyLinkButton url={cancelUrl} />
        <p>
          <Link to={cancelPath} className="link inline-flex min-h-tap items-center">
            Ouvrir ma page d'annulation
          </Link>
        </p>
      </section>

      {/* Après le lien d'annulation : le client l'a sauvegardé avant de partir sur Instagram
          (sur iOS, l'app peut décharger cet onglet et le récapitulatif n'existe qu'ici). */}
      <section aria-labelledby="address-title" className="flex flex-col gap-3">
        <h3 id="address-title">Le lieu exact</h3>
        <p>{LOCATION_NOTICE}</p>
        <p>
          Donne à Alix ton prénom et l'heure du rendez-vous, n'envoie pas ton lien d'annulation.
        </p>
        <p>
          <InstagramLink />
        </p>
      </section>

      <p>
        <ButtonLink to="/" variant="secondary" className="w-full sm:w-auto">
          Retour à l'accueil
        </ButtonLink>
      </p>
    </StepFrame>
  );
}

type CopyStatus = "idle" | "copied" | "failed";

/**
 * Copie le lien dans le presse-papiers. `navigator.clipboard` n'existe que sur une page
 * sécurisée (https, localhost) et peut être refusé : on propose alors de copier à la main.
 * Le message de résultat est dans une zone `role="status"` présente DÈS le départ (vide) :
 * les lecteurs d'écran n'annoncent de façon fiable que les changements d'une zone déjà là.
 */
function CopyLinkButton({ url }: { url: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error("Presse-papiers indisponible");
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p>
        <Button variant="secondary" onClick={handleCopy} className="w-full sm:w-auto">
          {status === "copied" ? "Lien copié" : "Copier le lien"}
        </Button>
      </p>
      <p role="status" className="font-semibold">
        {status === "copied" && "Lien copié. Colle-le dans tes notes ou envoie-le-toi."}
        {status === "failed" &&
          "Copie impossible sur cet appareil : sélectionne le lien ci-dessus pour le copier, ou fais une capture d'écran."}
      </p>
    </div>
  );
}
