import { Link } from "react-router";
import { InstagramLink } from "@/components/InstagramLink";
import { LegalList, LegalSection, ToComplete } from "@/components/Legal";
import { PageMeta } from "@/components/PageMeta";
import { PageHeader, Section } from "@/components/Section";
import { BOOKING_RULES } from "@/lib/bookingRules";
import { LOCATION_NOTICE } from "@/lib/contact";

/** Horizon de réservation, en semaines (28 jours = 4 semaines). */
const MAX_ADVANCE_WEEKS = BOOKING_RULES.maxAdvanceDays / 7;

/**
 * Conditions de réservation (consigne 27). Ne décrit QUE ce que le site fait réellement : les
 * chiffres viennent de BOOKING_RULES (copie de private.settings(), qui fait foi). Ce qu'Alix
 * doit décider ou fournir (identité, retard, absence, médiation) reste en `ToComplete`.
 */
export function ConditionsPage() {
  return (
    <>
      <PageMeta
        title="Conditions de réservation"
        description="Comment réserver, annuler et payer un rendez-vous chez CutsByAlix."
      />
      <PageHeader
        title="Conditions de réservation"
        lead="Comment réserver, annuler et payer ton rendez-vous."
      />
      <Section className="pt-0 md:pt-0">
        <LegalSection title="Qui propose le service">
          <p>
            Les coupes et barbes sont réalisées par <ToComplete>nom et prénom d'Alix</ToComplete>,
            sous le nom CutsByAlix. Ses coordonnées complètes figurent dans les{" "}
            <Link to="/mentions-legales" className="link">
              mentions légales
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection title="Réserver">
          <LegalList>
            <li>Aucun compte n'est nécessaire.</li>
            <li>
              Tu indiques ton prénom, ton nom, et ton numéro de téléphone et/ou ton adresse e-mail.
            </li>
            <li>
              Tu peux réserver jusqu'à {BOOKING_RULES.minNoticeHours} h avant le rendez-vous, et au
              plus {MAX_ADVANCE_WEEKS} semaines à l'avance.
            </li>
            <li>
              Au plus {BOOKING_RULES.maxFutureBookings} rendez-vous à venir par numéro de téléphone
              ou par adresse e-mail.
            </li>
            <li>
              Le rendez-vous est confirmé à l'écran. Aucun e-mail n'est envoyé : garde ton lien
              d'annulation (copie-le ou fais une capture d'écran).
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="Le lieu">
          <p>
            Chaque créneau indique sa localité. {LOCATION_NOTICE} Le site n'affiche ni n'enregistre
            aucune adresse.
          </p>
        </LegalSection>

        <LegalSection title="Annuler">
          <LegalList>
            <li>
              En ligne, avec ton lien d'annulation personnel, jusqu'à{" "}
              {BOOKING_RULES.cancelNoticeHours} h avant le rendez-vous.
            </li>
            <li>
              Après ce délai, ou si tu as perdu ton lien : écris directement à Alix sur Instagram.
            </li>
            <li>
              Alix peut aussi annuler un rendez-vous en cas d'imprévu.{" "}
              <ToComplete>comment le client en est prévenu</ToComplete>
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="Retard et absence">
          <p>
            <ToComplete>
              règle d'Alix en cas de retard (tolérance) ou d'absence sans prévenir
            </ToComplete>
          </p>
        </LegalSection>

        <LegalSection title="Prix et paiement">
          <p>
            Les prix affichés sur le site sont ceux de la prestation. Le paiement se fait sur place,
            en liquide ou par virement ; aucun paiement n'a lieu sur le site.
          </p>
        </LegalSection>

        <LegalSection title="Données personnelles">
          <p>
            Tes informations servent uniquement à gérer ton rendez-vous. Le détail est dans la{" "}
            <Link to="/politique-confidentialite" className="link">
              politique de confidentialité
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection title="Litiges">
          <p>En cas de désaccord, contacte d'abord Alix pour trouver une solution à l'amiable.</p>
          <p>
            Médiateur de la consommation :{" "}
            <ToComplete>
              nom et coordonnées du médiateur, si l'activité est exercée à titre professionnel
            </ToComplete>
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            <InstagramLink />
          </p>
          <p className="text-muted">
            Dernière mise à jour : <ToComplete>date de mise en ligne de ces conditions</ToComplete>
          </p>
        </LegalSection>
      </Section>
    </>
  );
}
