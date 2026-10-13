import { InstagramLink } from "@/components/InstagramLink";
import { LegalList, LegalSection, ToComplete } from "@/components/Legal";
import { PageMeta } from "@/components/PageMeta";
import { PageHeader, Section } from "@/components/Section";
import { BOOKING_RULES } from "@/lib/bookingRules";

/** Durée de conservation des données clients (docs/SPEC.md, « Règles de gestion »). */
const RETENTION_MONTHS = 6;

/**
 * Politique de confidentialité (RGPD, art. 13). Décrit ce que le site fait RÉELLEMENT :
 * données du formulaire de réservation (minimisation, CLAUDE.md), récapitulatif gardé en
 * sessionStorage (receiptStorage.ts), aucun cookie, polices auto-hébergées. Les informations
 * personnelles du responsable de traitement restent en `ToComplete`.
 */
export function PrivacyPolicyPage() {
  return (
    <>
      <PageMeta
        title="Politique de confidentialité"
        description="Comment CutsByAlix traite tes données personnelles lors d'une réservation."
      />
      <PageHeader
        title="Politique de confidentialité"
        lead="Pour réserver, le site te demande le strict minimum. Voici ce qui est collecté, pourquoi, combien de temps, et comment exercer tes droits."
      />
      <Section className="pt-0 md:pt-0">
        <LegalSection title="Responsable du traitement">
          <LegalList>
            <li>
              <ToComplete>nom et prénom d'Alix</ToComplete>
            </li>
            <li>
              Adresse : <ToComplete>adresse postale</ToComplete>
            </li>
            <li>
              E-mail : <ToComplete>adresse e-mail de contact</ToComplete>
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="Données collectées">
          <p>Quand tu réserves un créneau, et seulement à ce moment-là :</p>
          <LegalList>
            <li>ton prénom et ton nom ;</li>
            <li>ton numéro de téléphone et/ou ton adresse e-mail ;</li>
            <li>la prestation, la date, l'heure et la localité du rendez-vous.</li>
          </LegalList>
          <p>
            Il n'y a ni compte client, ni paiement en ligne : aucune donnée bancaire ne passe par le
            site. Aucune adresse n'y est enregistrée.
          </p>
          <p>
            Pour afficher les pages et protéger le site, l'hébergeur traite des données techniques
            de connexion (adresse IP, type de navigateur), selon sa propre politique.
          </p>
        </LegalSection>

        <LegalSection title="Finalités et base légale">
          <LegalList>
            <li>
              Gérer ton rendez-vous : le réserver, te prévenir en cas d'imprévu, permettre son
              annulation. Base légale : l'exécution du service que tu demandes, auquel tu consens en
              cochant la case du formulaire.
            </li>
            <li>
              Éviter les abus : au plus {BOOKING_RULES.maxFutureBookings} rendez-vous à venir par
              numéro de téléphone ou par e-mail. Base légale : l'intérêt légitime d'Alix à garder
              des créneaux disponibles pour tous.
            </li>
          </LegalList>
          <p>Tes données ne servent à rien d'autre : ni publicité, ni revente, ni prospection.</p>
        </LegalSection>

        <LegalSection title="Durée de conservation">
          <p>
            Tes données sont supprimées {RETENTION_MONTHS} mois après la date du rendez-vous, qu'il
            ait eu lieu ou qu'il ait été annulé.
          </p>
        </LegalSection>

        <LegalSection title="Destinataires et sous-traitants">
          <p>Seule Alix a accès à tes données. Elles sont hébergées par deux prestataires :</p>
          <LegalList>
            <li>Supabase : base de données des réservations ;</li>
            <li>Cloudflare : hébergement et diffusion des pages du site.</li>
          </LegalList>
          <p>
            Ces sociétés peuvent traiter des données hors de l'Union européenne.{" "}
            <ToComplete>
              région d'hébergement Supabase et garanties encadrant les transferts (clauses
              contractuelles types, Data Privacy Framework…), à vérifier dans les conditions de
              Cloudflare et de Supabase
            </ToComplete>
          </p>
        </LegalSection>

        <LegalSection title="Tes droits">
          <p>Tu peux à tout moment :</p>
          <LegalList>
            <li>accéder à tes données et en obtenir une copie ;</li>
            <li>les faire corriger ou supprimer ;</li>
            <li>t'opposer à leur traitement ou en demander la limitation ;</li>
            <li>demander leur portabilité.</li>
          </LegalList>
          <p>
            Pour cela, écris à <ToComplete>adresse e-mail de contact</ToComplete> ou à Alix en
            message privé sur Instagram. Une réponse t'est apportée dans un délai d'un mois.
          </p>
          <p>
            Pour annuler un rendez-vous, utilise ton lien d'annulation personnel (jusqu'à{" "}
            {BOOKING_RULES.cancelNoticeHours} h avant), ou contacte Alix.
          </p>
          <p>
            Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à
            la CNIL (cnil.fr).
          </p>
        </LegalSection>

        <LegalSection title="Cookies et stockage local">
          <p>
            Le site n'utilise aucun cookie, ni publicitaire ni de mesure d'audience. Aucun bandeau
            de consentement n'est donc nécessaire.
          </p>
          <p>
            Après une réservation, le récapitulatif (date, heure, prestation, localité et lien
            d'annulation) est gardé dans ton navigateur, pour cet onglet seulement, afin de ne pas
            le perdre si tu recharges la page. Il ne contient ni ton nom, ni tes coordonnées, et
            s'efface à la fermeture de l'onglet.
          </p>
          <p>
            Les polices de caractères sont servies par ce site : aucune requête n'est envoyée à un
            service tiers pour les afficher. Le lien vers Instagram t'emmène sur un site externe,
            soumis à sa propre politique de confidentialité.
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Une question sur tes données : <ToComplete>adresse e-mail de contact</ToComplete>.
          </p>
          <p>
            <InstagramLink />
          </p>
          <p className="text-muted">
            Dernière mise à jour : <ToComplete>date de mise en ligne de cette politique</ToComplete>
          </p>
        </LegalSection>
      </Section>
    </>
  );
}
