import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Choice } from "@/components/Choice";
import { Field } from "@/components/Field";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import {
  EmptyMessage,
  ErrorMessage,
  LoadingMessage,
  SuccessMessage,
} from "@/components/StatusMessage";
import {
  AdminError,
  createAvailability,
  deleteAvailability,
  getAvailabilities,
  getBookingRules,
  getLocations,
  type Availability,
  type Location,
} from "@/features/admin/data";
import {
  bookableWindow,
  describeSlots,
  formatDelay,
  groupByParisWeek,
  slotStarts,
  type BookingRules,
} from "@/features/admin/slots";
import { formatDayKey, formatLongDay, formatTime, parisDateTime, parisDayKey } from "@/lib/dates";
import { availabilityFormSchema } from "@/lib/schemas";
import { useAsync } from "@/lib/useAsync";
import { GroupError } from "@/pages/booking/StepFrame";

const ERROR_MESSAGES: Partial<Record<string, string>> = {
  invalid_input: "Indique le jour, l'heure de début, l'heure de fin et le lieu.",
  invalid_range: "L'heure de fin doit être après l'heure de début (24 h maximum).",
  in_past: "Cette plage commence dans le passé : choisis un jour et une heure à venir.",
  location_inactive: "Ce lieu n'est plus actif. Recharge la page et choisis un autre lieu.",
  availability_overlap:
    "Cette plage chevauche une autre disponibilité (tous lieux confondus). Modifie les horaires.",
  availability_has_bookings:
    "Des rendez-vous sont prévus sur cette plage : annule-les d'abord, puis supprime-la.",
  not_found: "Cette disponibilité n'existe plus. Recharge la page.",
  forbidden: "Ton compte n'a pas accès à cette action. Reconnecte-toi.",
};

function errorMessage(caught: unknown, rules?: BookingRules): string {
  if (caught instanceof AdminError && caught.code === "too_short" && rules) {
    return tooShortMessage(rules);
  }
  return (
    (caught instanceof AdminError && ERROR_MESSAGES[caught.code]) ||
    "L'action n'a pas pu être enregistrée. Vérifie ta connexion, puis réessaie."
  );
}

function tooShortMessage(rules: BookingRules): string {
  return `La plage doit durer au moins ${formatDelay(rules.slotStepMin)} (un créneau).`;
}

/** « 3 créneaux », « 1 réservation » : nombre + nom accordé. */
function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** « jeudi 15 octobre à 10:00 » (heure de Paris). */
function formatMoment(value: Date | string): string {
  return `${formatLongDay(value)} à ${formatTime(value)}`;
}

async function loadSetup(): Promise<{ rules: BookingRules; locations: Location[] }> {
  const [rules, locations] = await Promise.all([getBookingRules(), getLocations()]);
  return { rules, locations };
}

/** Disponibilités : plages par semaine, ajout avec aperçu des créneaux, suppression. */
export function AdminAvailabilitiesPage() {
  const setup = useAsync("availability-setup", loadSetup);
  const availabilities = useAsync("availabilities", getAvailabilities);

  return (
    <>
      <PageMeta title="Disponibilités" description="Gestion des disponibilités publiées." />
      <Section>
        <h1>Disponibilités</h1>
        <p>
          Les clients ne réservent que dans ces plages, découpées en créneaux depuis le début de
          chaque plage.
        </p>
      </Section>
      <Section>
        {setup.status === "loading" && <LoadingMessage>Chargement…</LoadingMessage>}
        {setup.status === "error" && (
          <ErrorMessage onRetry={setup.reload}>
            Impossible de charger les lieux et les règles de réservation.
          </ErrorMessage>
        )}
        {setup.status === "success" &&
          (setup.data.locations.length === 0 ? (
            <NoActiveLocation />
          ) : (
            <AddAvailabilityForm
              rules={setup.data.rules}
              locations={setup.data.locations}
              onAdded={availabilities.reload}
            />
          ))}
      </Section>
      <Section>
        <h2>À venir</h2>
        {availabilities.status === "loading" && (
          <LoadingMessage>Chargement des disponibilités…</LoadingMessage>
        )}
        {availabilities.status === "error" && (
          <ErrorMessage onRetry={availabilities.reload}>
            Impossible de charger les disponibilités.
          </ErrorMessage>
        )}
        {availabilities.status === "success" &&
          (availabilities.data.length === 0 ? (
            <EmptyMessage>
              <p>Aucune disponibilité à venir : les clients ne peuvent pas réserver.</p>
            </EmptyMessage>
          ) : (
            <div className="flex flex-col gap-8">
              {groupByParisWeek(availabilities.data).map((week) => (
                <section key={week.monday} aria-labelledby={`week-${week.monday}`}>
                  <h3 id={`week-${week.monday}`} className="mb-3 first-letter:uppercase">
                    Semaine du {formatDayKey(week.monday)}
                  </h3>
                  <ul className="flex flex-col gap-3">
                    {week.items.map((availability) => (
                      <AvailabilityItem
                        key={availability.id}
                        availability={availability}
                        onDeleted={availabilities.reload}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
      </Section>
    </>
  );
}

/** Aucun lieu actif : on explique, sans aucun moyen d'en créer ou d'en activer un ici. */
function NoActiveLocation() {
  return (
    <EmptyMessage>
      <h2 className="text-xl">Aucun lieu actif</h2>
      <p>
        Tu ne peux pas encore ajouter de disponibilité : aucun lieu n'est activé. Les lieux sont
        activés par le développeur, au moment de la mise en ligne. Demande-lui de le faire.
      </p>
    </EmptyMessage>
  );
}

type FormProps = {
  rules: BookingRules;
  locations: Location[];
  onAdded: () => void;
};

function AddAvailabilityForm({ rules, locations, onAdded }: FormProps) {
  // « Maintenant » figé à l'ouverture de l'écran : un rendu React doit rester pur (même
  // entrée → même sortie). La base revérifie tout avec sa propre horloge.
  const [now] = useState(() => new Date());
  const today = parisDayKey(now);
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState("14:00");
  const [to, setTo] = useState("18:00");
  const [locationId, setLocationId] = useState<string | null>(
    locations.length === 1 ? locations[0]!.id : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [locationError, setLocationError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  // Plage saisie, en instants absolus (les heures saisies sont des heures de Paris).
  const range = readRange(day, from, to);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSuccess(undefined);
    const parsed = availabilityFormSchema.safeParse({
      day,
      from,
      to,
      locationId: locationId ?? "",
    });
    if (!parsed.success || !range) {
      const codes = parsed.success ? ["invalid_input"] : parsed.error.issues.map((i) => i.message);
      if (codes.includes("location_required")) setLocationError("Choisis un lieu.");
      const other = codes.find((code) => code !== "location_required");
      if (other) setError(ERROR_MESSAGES[other] ?? ERROR_MESSAGES.invalid_input);
      return;
    }
    setSubmitting(true);
    try {
      const created = await createAvailability({
        locationId: parsed.data.locationId,
        startsAt: range.start.toISOString(),
        endsAt: range.end.toISOString(),
      });
      setSuccess(
        `Disponibilité ajoutée : ${formatLongDay(created.startsAt)}, ${formatTime(created.startsAt)} – ${formatTime(created.endsAt)}, ${created.locationLabel} (${plural(created.slotCount, "créneau", "créneaux")}).`,
      );
      onAdded();
    } catch (caught) {
      setError(errorMessage(caught, rules));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="add-availability"
      className="flex flex-col gap-5"
    >
      <h2 id="add-availability">Ajouter une plage</h2>
      <Field
        id="availability-day"
        name="day"
        type="date"
        label="Jour"
        min={today}
        value={day}
        onChange={(e) => setDay(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="availability-from"
          name="from"
          type="time"
          step={300}
          label="Début"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          id="availability-to"
          name="to"
          type="time"
          step={300}
          label="Fin"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={locationError ? "availability-location-error" : undefined}
      >
        <legend className="mb-2 font-semibold">Lieu</legend>
        {locations.map((location) => (
          <Choice
            key={location.id}
            type="radio"
            name="location"
            value={location.id}
            checked={locationId === location.id}
            onChange={() => {
              setLocationId(location.id);
              setLocationError(undefined);
            }}
          >
            <span className="font-semibold">{location.publicLabel}</span>
          </Choice>
        ))}
        <GroupError id="availability-location-error" message={locationError} />
      </fieldset>
      <SlotPreview range={range} rules={rules} now={now} />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}
      <Button
        type="submit"
        disabled={submitting}
        aria-busy={submitting || undefined}
        className="w-full sm:w-auto"
      >
        {submitting ? "Ajout en cours…" : "Ajouter la disponibilité"}
      </Button>
    </form>
  );
}

/** Jour + heures saisis → instants, ou null si un champ est vide ou mal formé. */
function readRange(day: string, from: string, to: string): { start: Date; end: Date } | null {
  try {
    return { start: parisDateTime(day, from), end: parisDateTime(day, to) };
  } catch {
    return null;
  }
}

type PreviewProps = {
  range: { start: Date; end: Date } | null;
  rules: BookingRules;
  now: Date;
};

/**
 * Aperçu en direct : créneaux qui résulteront de la plage et période où les clients pourront
 * les réserver. Zone `aria-live` : relue par les lecteurs d'écran à chaque changement.
 */
function SlotPreview({ range, rules, now }: PreviewProps) {
  return (
    <div
      aria-live="polite"
      data-testid="slot-preview"
      className="flex flex-col gap-1 border border-ink/15 bg-surface p-4"
    >
      <PreviewContent range={range} rules={rules} now={now} />
    </div>
  );
}

function PreviewContent({ range, rules, now }: PreviewProps) {
  if (!range) return <p className="text-muted">Indique le jour et les heures.</p>;
  if (range.end <= range.start) {
    return <p className="font-semibold">L'heure de fin doit être après l'heure de début.</p>;
  }
  if (range.start <= now) {
    return <p className="font-semibold">Cette plage commence dans le passé.</p>;
  }

  const starts = slotStarts(range.start, range.end, rules.slotStepMin);
  if (starts.length === 0) return <p className="font-semibold">{tooShortMessage(rules)}</p>;

  const bookable = bookableWindow(starts, rules, now);
  const notice = formatDelay(rules.minNoticeMin);
  return (
    <>
      <p className="font-semibold">{describeSlots(starts)}</p>
      {bookable.status === "never" ? (
        <p className="field-error">
          Ne sera jamais proposée aux clients : ils réservent au plus tard {notice} avant un
          créneau.
        </p>
      ) : (
        <>
          <p>
            Réservable par les clients{" "}
            {bookable.from ? `du ${formatMoment(bookable.from)}` : "dès maintenant"} jusqu'au{" "}
            {formatMoment(bookable.until)}.
          </p>
          {bookable.tooSoonCount > 0 && (
            <p className="field-error">
              {plural(bookable.tooSoonCount, "créneau", "créneaux")} à moins de {notice} : non
              proposé{bookable.tooSoonCount > 1 ? "s" : ""} aux clients.
            </p>
          )}
        </>
      )}
    </>
  );
}

function AvailabilityItem({
  availability,
  onDeleted,
}: {
  availability: Availability;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string>();
  const hours = `${formatTime(availability.startsAt)} – ${formatTime(availability.endsAt)}`;
  const label = `${formatLongDay(availability.startsAt)}, ${hours}`;

  async function handleDelete() {
    setDeleting(true);
    setError(undefined);
    try {
      await deleteAvailability(availability.id);
      onDeleted();
    } catch (caught) {
      setError(errorMessage(caught));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <Card as="li">
      <p className="text-lg font-bold first-letter:uppercase">
        {formatLongDay(availability.startsAt)}
      </p>
      <p>
        {hours} · {availability.locationLabel}
      </p>
      <p className="text-muted">
        {plural(availability.slotCount, "créneau", "créneaux")} ·{" "}
        {plural(availability.bookingCount, "réservation", "réservations")}
      </p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {/* Suppression en deux temps : pas de suppression par un appui malheureux. */}
      {confirming ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
            Garder
          </Button>
          <Button onClick={handleDelete} disabled={deleting} aria-busy={deleting || undefined}>
            {deleting ? "Suppression…" : "Oui, supprimer"}
          </Button>
        </div>
      ) : (
        <p>
          <Button
            variant="secondary"
            onClick={() => setConfirming(true)}
            aria-label={`Supprimer la disponibilité du ${label}`}
          >
            Supprimer
          </Button>
        </p>
      )}
    </Card>
  );
}
