import { useState, type SubmitEvent } from "react";
import { Choice } from "@/components/Choice";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import { getServices } from "@/features/booking/data";
import { LOCATION_NOTICE } from "@/lib/contact";
import { useAsync } from "@/lib/useAsync";
import { GroupError, StepActions, StepFrame } from "@/pages/booking/StepFrame";

type ServiceStepProps = {
  serviceId: string | null;
  focusOnMount: boolean;
  onChange: (serviceId: string, serviceName: string) => void;
  onNext: () => void;
};

/** Étape 1 : choix de la prestation. */
export function ServiceStep({ serviceId, focusOnMount, onChange, onNext }: ServiceStepProps) {
  const services = useAsync("services", getServices);
  const [error, setError] = useState<string>();

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (serviceId === null) {
      setError("Choisis une prestation pour continuer.");
      return;
    }
    onNext();
  }

  return (
    <StepFrame number={1} title="Quelle prestation ?" focusOnMount={focusOnMount}>
      {services.status === "loading" && (
        <LoadingMessage>Chargement des prestations…</LoadingMessage>
      )}
      {services.status === "error" && (
        <ErrorMessage onRetry={services.reload}>
          Impossible de charger les prestations pour le moment. Réessaie dans quelques instants.
        </ErrorMessage>
      )}
      {services.status === "success" && services.data.length === 0 && (
        <EmptyMessage>
          <p className="font-semibold">Aucune prestation disponible pour l'instant.</p>
          <p>Reviens un peu plus tard.</p>
        </EmptyMessage>
      )}
      {services.status === "success" && services.data.length > 0 && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <fieldset
            className="flex flex-col gap-3"
            aria-describedby={error ? "service-error" : undefined}
          >
            <legend className="sr-only">Prestation</legend>
            {services.data.map((service) => (
              <Choice
                key={service.id}
                type="radio"
                name="service"
                value={service.id}
                checked={serviceId === service.id}
                onChange={() => {
                  onChange(service.id, service.name);
                  setError(undefined);
                }}
              >
                <span className="font-semibold">{service.name}</span>
                <span className="text-sm text-muted">
                  {service.durationMin} min · {service.priceLabel ?? "Prix à confirmer"}
                </span>
              </Choice>
            ))}
            <GroupError id="service-error" message={error} />
          </fieldset>
          {/* Seule mention pratique de /reserver : le lieu (aucune mention de paiement ici,
              consigne 27 ; elle reste sur l'accueil). */}
          <p>{LOCATION_NOTICE}</p>
          <StepActions submitLabel="Continuer" />
        </form>
      )}
    </StepFrame>
  );
}
