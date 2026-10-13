import { Link } from "react-router";
import { InstagramLink } from "@/components/InstagramLink";
import { LegalList, LegalSection, ToComplete } from "@/components/Legal";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";

/**
 * Mentions légales (loi pour la confiance dans l'économie numérique, art. 6 III).
 * Structure complète ; les informations personnelles d'Alix et les identifiants d'entreprise
 * restent en `ToComplete` : rien n'est inventé. Hébergeur : coordonnées publiques de
 * Cloudflare vérifiées le 2026-10-13 sur sa politique de confidentialité.
 */
export function LegalNoticePage() {
  return (
    <>
      <PageMeta title="Mentions légales" description="Mentions légales du site CutsByAlix." />
      <Section>
        <h1>Mentions légales</h1>
      </Section>
      <Section className="pt-0 md:pt-0">
        <LegalSection title="Éditeur du site">
          <p>Le site CutsByAlix est édité par :</p>
          <LegalList>
            <li>
              <ToComplete>nom et prénom d'Alix</ToComplete>
            </li>
            <li>
              <ToComplete>
                statut (ex. micro-entrepreneur) et numéro SIRET, si l'activité est déclarée
              </ToComplete>
            </li>
            <li>
              Adresse : <ToComplete>adresse postale de l'éditeur</ToComplete>
            </li>
            <li>
              E-mail : <ToComplete>adresse e-mail de contact</ToComplete>
            </li>
            <li>
              Téléphone :{" "}
              <ToComplete>numéro de téléphone (facultatif pour un particulier)</ToComplete>
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="Directeur de la publication">
          <p>
            <ToComplete>
              nom du directeur de la publication (en général, l'éditeur lui-même)
            </ToComplete>
          </p>
        </LegalSection>

        <LegalSection title="Hébergement">
          <p>Le site est hébergé par :</p>
          <LegalList>
            <li>
              Cloudflare, Inc. (service Cloudflare Pages), 101 Townsend St, San Francisco, CA 94107,
              États-Unis. Site : cloudflare.com. Téléphone :{" "}
              <ToComplete>téléphone de l'hébergeur</ToComplete>
            </li>
          </LegalList>
          <p>
            Les données des réservations et les photos de la galerie sont hébergées par Supabase
            (base de données et stockage de fichiers) :
          </p>
          <LegalList>
            <li>
              <ToComplete>
                entité contractante (la politique de confidentialité de Supabase nomme Supabase Pte.
                Ltd.) et adresse postale, d'après les conditions acceptées à l'ouverture du compte
              </ToComplete>
              . Site : supabase.com.
            </li>
            <li>
              Région d'hébergement : <ToComplete>région du projet Supabase</ToComplete>
            </li>
          </LegalList>
        </LegalSection>

        <LegalSection title="Conception et réalisation">
          <p>
            <ToComplete>nom du développeur du site, s'il souhaite être crédité</ToComplete>
          </p>
        </LegalSection>

        <LegalSection title="Propriété intellectuelle">
          <p>
            Les textes, photos, vidéos et le logo de ce site appartiennent à leur auteur,{" "}
            <ToComplete>nom du titulaire des droits</ToComplete>, sauf mention contraire. Toute
            reproduction, même partielle, sans autorisation écrite est interdite.
          </p>
          <p>
            Les personnes visibles sur les photos et vidéos ont donné leur accord pour leur
            publication. <ToComplete>à confirmer par Alix pour chaque photo publiée</ToComplete>
          </p>
          <p>
            La police de caractères Archivo est distribuée sous licence SIL Open Font License et
            servie depuis ce site, sans appel à un service tiers.
          </p>
        </LegalSection>

        <LegalSection title="Données personnelles">
          <p>
            Les informations demandées lors d'une réservation et la façon dont elles sont traitées
            sont décrites dans la{" "}
            <Link to="/politique-confidentialite" className="link">
              politique de confidentialité
            </Link>
            .
          </p>
        </LegalSection>

        <LegalSection title="Contact">
          <p>
            Pour toute question sur le site : <ToComplete>adresse e-mail de contact</ToComplete>, ou
            en message privé sur Instagram.
          </p>
          <p>
            <InstagramLink />
          </p>
        </LegalSection>
      </Section>
    </>
  );
}
