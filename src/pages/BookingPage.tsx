import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import type { AvailableSlot, BookingReceipt } from "@/features/booking/data";
import { clearReceipt, loadReceipt, saveReceipt } from "@/features/booking/receiptStorage";
import { contactFingerprint, type ContactForm } from "@/features/booking/validation";
import type { DayKey } from "@/lib/dates";
import { secureRandomUuid } from "@/lib/uuid";
import { ConfirmationStep } from "@/pages/booking/ConfirmationStep";
import { ContactStep } from "@/pages/booking/ContactStep";
import { ServiceStep } from "@/pages/booking/ServiceStep";
import { SlotStep } from "@/pages/booking/SlotStep";
import { SummaryStep } from "@/pages/booking/SummaryStep";

type Step = "service" | "slot" | "contact" | "summary" | "done";

/** Ordre des étapes : chacune est UNE entrée de l'historique, dans cet ordre. */
const STEP_ORDER: readonly Step[] = ["service", "slot", "contact", "summary"];

/**
 * Ce que l'on range dans `history.state` : l'étape seulement, jamais une donnée saisie.
 * `realigned` : entrée recalée sur l'étape 1 après un rechargement (pas un geste du client).
 */
type FlowState = { bookingStep: Step; realigned?: true };

function readFlowStep(state: unknown): Step | null {
  const step = (state as Partial<FlowState> | null)?.bookingStep;
  return step && (STEP_ORDER.includes(step) || step === "done") ? step : null;
}

const EMPTY_CONTACT: ContactForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  consent: false,
};

/**
 * Parcours de réservation en étapes : prestation → jour et créneau → coordonnées →
 * récapitulatif → confirmation. Le client choisit un créneau, jamais un lieu : chaque créneau
 * porte le lieu fixé par le barber dans sa disponibilité (libellé public seulement).
 *
 * Tout l'état du parcours vit ICI, dans le parent (« remonter l'état ») : chaque étape
 * reçoit ses valeurs en props et signale les changements par des fonctions `on…`. Revenir
 * en arrière ne perd donc rien : l'étape démontée n'emporte pas les données avec elle.
 * C'est l'équivalent d'un objet en session côté Symfony, mais en mémoire dans la page.
 *
 * Historique (C-04) : chaque étape est une entrée de l'historique du navigateur. L'étape est
 * rangée dans `history.state` (pas dans l'URL, qui reste « /reserver ») : le geste Retour
 * d'Android ou d'iOS revient à l'étape précédente au lieu de quitter la page. La page reste
 * montée d'une entrée à l'autre (même route), donc la saisie reste en mémoire. Elle n'est
 * jamais stockée : un rechargement en plein formulaire repart de l'étape 1 (minimisation).
 *
 * Confirmation (C-03) : le récapitulatif (sans donnée personnelle) est gardé dans
 * `sessionStorage` ; un rechargement sur une entrée du parcours le réaffiche. Une arrivée
 * « à neuf » sur /reserver (menu, lien) l'efface et repart de zéro.
 */
export function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Étape portée par l'entrée d'historique courante ; null = arrivée à neuf (étape 1).
  const flowStep = readFlowStep(location.state);

  // Au montage seulement : arrivée à neuf = on oublie toute réservation précédente ; entrée du
  // parcours (rechargement) = on reprend le récapitulatif s'il en reste un.
  const [receipt, setReceipt] = useState<BookingReceipt | null>(() => {
    if (flowStep === null) {
      clearReceipt();
      return null;
    }
    return loadReceipt(new Date());
  });
  // Faux au premier affichage : le focus reste en haut de page (titre h1), comme partout. Vrai
  // dès que le client a changé d'étape (bouton du site ou du navigateur), et il le RESTE : revenir
  // à la toute première entrée d'historique (même clé qu'à l'arrivée) déplace aussi le focus sur
  // le titre de l'étape. Ajustement d'état pendant le rendu, comme le permet React.
  const [initialKey] = useState(location.key);
  const [hasNavigated, setHasNavigated] = useState(false);
  if (
    !hasNavigated &&
    location.key !== initialKey &&
    !(location.state as FlowState | null)?.realigned
  ) {
    setHasNavigated(true);
  }

  const [service, setService] = useState<{ id: string; name: string } | null>(null);
  const [day, setDay] = useState<DayKey | null>(null);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [slotNotice, setSlotNotice] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [website, setWebsite] = useState("");
  // Clé d'idempotence (C-05, ADR 0009) : la même pour tous les essais d'UNE réservation. Elle est
  // décidée au moment de l'ENVOI, pas à chaque frappe : on retient l'empreinte de la dernière
  // réservation envoyée avec sa clé. Même empreinte (même prestation, même créneau, mêmes
  // coordonnées après nettoyage) = même clé ; sinon une nouvelle. Les états intermédiaires
  // d'une saisie (champ effacé puis retapé) n'ont ainsi aucun effet.
  const lastRequest = useRef<{ fingerprint: string; key: string | null } | null>(null);
  function getRequestId(): string | null {
    if (service === null || slot === null) return null;
    const fingerprint = JSON.stringify([
      service.id,
      slot.startsAt,
      slot.locationId,
      contactFingerprint(contact),
    ]);
    if (lastRequest.current?.fingerprint !== fingerprint) {
      lastRequest.current = { fingerprint, key: secureRandomUuid() };
    }
    return lastRequest.current.key;
  }

  // Une réservation faite : toutes les entrées du parcours montrent la confirmation (le Retour
  // ne rouvre pas le formulaire, pas de double réservation par erreur).
  const step: Step = receipt ? "done" : (flowStep ?? "service");

  // Rechargement au milieu du parcours (ou confirmation sans récapitulatif gardé) : la saisie
  // n'existe plus, l'étape 1 s'affiche. On recale l'entrée d'historique sur l'étape 1, pour
  // que les boutons Retour (du site et du navigateur) restent cohérents. Une seule fois.
  const mustRealign =
    flowStep !== null && flowStep !== "service" && receipt === null && service === null;
  useEffect(() => {
    if (mustRealign) {
      navigate(location.pathname, {
        replace: true,
        state: { bookingStep: "service", realigned: true } satisfies FlowState,
      });
    }
  }, [mustRealign, navigate, location.pathname]);

  /** Étape suivante : nouvelle entrée d'historique. */
  function goTo(next: Step) {
    if (next !== "slot") setSlotNotice(null);
    navigate(location.pathname, { state: { bookingStep: next } satisfies FlowState });
  }

  /**
   * Revenir de `distance` étapes : on recule dans l'historique, comme le bouton du navigateur,
   * pour que les deux restent alignés. Si l'historique ne correspond pas (entrée affichée
   * après un rechargement), on remplace l'entrée au lieu de sortir de la page.
   */
  function goBack(to: Step) {
    const distance = STEP_ORDER.indexOf(view) - STEP_ORDER.indexOf(to);
    if (flowStep === view && distance > 0) {
      navigate(-distance);
    } else {
      navigate(location.pathname, { replace: true, state: { bookingStep: to } });
    }
  }

  // Un créneau choisi n'est valable que pour la prestation de ce moment-là.
  function changeService(id: string, name: string) {
    if (service?.id !== id) setSlot(null);
    setService({ id, name });
  }

  function changeDay(next: DayKey) {
    setDay(next);
    setSlot(null);
    setSlotNotice(null);
  }

  // Écran réellement affiché : l'étape demandée, sauf s'il lui manque une donnée (prestation ou
  // créneau) : on montre alors l'étape qui la demande. C'est cet écran qui sert de `key`, pour
  // ne pas remonter (et recharger) le même écran quand seule l'entrée d'historique change.
  const view: Step =
    step === "done" && receipt
      ? "done"
      : step === "service" || service === null
        ? "service"
        : step === "slot" || slot === null
          ? "slot"
          : step;

  function renderStep() {
    if (view === "done" && receipt) {
      return <ConfirmationStep receipt={receipt} focusOnMount={hasNavigated} />;
    }
    if (view === "service" || service === null) {
      return (
        <ServiceStep
          serviceId={service?.id ?? null}
          focusOnMount={hasNavigated}
          onChange={changeService}
          onNext={() => goTo("slot")}
        />
      );
    }
    if (view === "slot" || slot === null) {
      return (
        <SlotStep
          serviceId={service.id}
          day={day}
          slot={slot}
          notice={slotNotice}
          focusOnMount={hasNavigated}
          onDayChange={changeDay}
          onSlotChange={setSlot}
          onBack={() => goBack("service")}
          onNext={() => goTo("contact")}
        />
      );
    }
    if (view === "contact") {
      return (
        <ContactStep
          contact={contact}
          website={website}
          focusOnMount={hasNavigated}
          onChange={setContact}
          onWebsiteChange={setWebsite}
          onBack={() => goBack("slot")}
          onNext={() => goTo("summary")}
        />
      );
    }
    return (
      <SummaryStep
        serviceId={service.id}
        serviceName={service.name}
        slot={slot}
        contact={contact}
        website={website}
        getRequestId={getRequestId}
        focusOnMount={hasNavigated}
        onBack={() => goBack("contact")}
        onSlotLost={(message) => {
          setSlot(null);
          setSlotNotice(message);
          goBack("slot");
        }}
        // La base refuse cette clé : la prochaine tentative en tire une nouvelle.
        onRequestConflict={() => {
          lastRequest.current = null;
        }}
        onBooked={(done) => {
          saveReceipt(done);
          setReceipt(done);
          // L'entrée du récapitulatif devient celle de la confirmation : rechargeable.
          navigate(location.pathname, {
            replace: true,
            state: { bookingStep: "done" } satisfies FlowState,
          });
        }}
      />
    );
  }

  return (
    <>
      <PageMeta
        title="Réserver"
        description="Réserve ton créneau chez CutsByAlix en une minute : prestation, jour, créneau libre."
      />
      <Section>
        <h1>Réserver</h1>
        <p className="text-lg">Réserve ta coupe en une minute.</p>
      </Section>
      <Section>
        {/* `key` : un cadre neuf à chaque étape (voir StepFrame, gestion du focus). */}
        <div key={view} className="w-full">
          {renderStep()}
        </div>
      </Section>
    </>
  );
}
