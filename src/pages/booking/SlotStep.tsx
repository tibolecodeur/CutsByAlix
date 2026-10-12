import { useRef, useState, type MouseEvent, type SubmitEvent } from "react";
import { Choice } from "@/components/Choice";
import { InstagramLink } from "@/components/InstagramLink";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import {
  calendarDays,
  countByDay,
  dayLabel,
  hasAvailableDay,
} from "@/features/booking/availability";
import { getAvailableDays, getAvailableSlots, type AvailableSlot } from "@/features/booking/data";
import { firstBookableDay, isTooSoonDay } from "@/features/booking/notice";
import { BOOKING_RULES } from "@/lib/bookingRules";
import {
  dayKeyParts,
  formatDayKey,
  formatTime,
  isoWeekday,
  parisDayKey,
  type DayKey,
} from "@/lib/dates";
import { useAsync, type AsyncResult } from "@/lib/useAsync";
import { GroupError, StepActions, StepFrame } from "@/pages/booking/StepFrame";

const WEEKDAY_HEADERS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

/**
 * Case du calendrier : le bouton radio est masqué visuellement (sr-only) mais reste le vrai
 * contrôle (clavier : flèches ; lecteur d'écran : « mardi 13 octobre, 3 créneaux disponibles,
 * bouton radio »). Le libellé visible fait 44 px de haut ; `focus-ring-within` montre le focus
 * clavier.
 *
 * Trois apparences, couleurs du site uniquement :
 * - jour disponible : contour noir plein ;
 * - jour SANS créneau : grisé (texte secondaire, fond `ink` à 5 %), barré, et le bouton radio est
 *   `disabled` : le gris n'est pas le seul signal, le jour sort aussi du clavier. Exception : le
 *   jour DÉJÀ CHOISI n'est jamais désactivé (sa dernière place a pu partir pendant que le client
 *   était à l'étape suivante) : il reste sélectionné et visible, et la liste dit « Aucun créneau
 *   libre » ;
 * - disponibilité inconnue (chargement des jours impossible) : l'apparence d'avant.
 */
const DAY_BASE =
  "focus-ring-within flex min-h-tap flex-col items-center justify-center border py-1 leading-tight";
const DAY_UNKNOWN = `${DAY_BASE} cursor-pointer border-ink/20 bg-surface text-ink has-checked:border-ink has-checked:bg-ink has-checked:text-white`;
const DAY_AVAILABLE = `${DAY_BASE} cursor-pointer border-ink bg-surface text-ink has-checked:bg-ink has-checked:text-white`;
const DAY_UNAVAILABLE = `${DAY_BASE} cursor-not-allowed border-ink/10 bg-ink/5 text-muted line-through has-checked:border-ink has-checked:bg-ink has-checked:text-white`;

type SlotStepProps = {
  serviceId: string;
  day: DayKey | null;
  slot: AvailableSlot | null;
  /** Message affiché en arrivant (ex. créneau pris entre-temps). */
  notice: string | null;
  focusOnMount: boolean;
  onDayChange: (day: DayKey) => void;
  onSlotChange: (slot: AvailableSlot) => void;
  onBack: () => void;
  onNext: () => void;
};

/** Étape 3 : jour (4 semaines à venir) puis créneau libre. */
export function SlotStep(props: SlotStepProps) {
  const { serviceId, day, slot, notice, focusOnMount } = props;
  const [error, setError] = useState<string>();
  const slotsRef = useRef<HTMLDivElement>(null);

  // Sur mobile, les créneaux sont sous le calendrier, hors de l'écran : après un toucher sur
  // un jour, on les fait remonter (instantanément, donc sans animation). Pas au clavier
  // (`detail` vaut 0) : les flèches parcourent les jours, l'écran ne doit pas sauter.
  function revealSlots(event: MouseEvent<HTMLLabelElement>) {
    const list = slotsRef.current;
    if (event.detail === 0 || !list) return;
    if (list.getBoundingClientRect().top > window.innerHeight * 0.6) {
      list.scrollIntoView({ block: "start" });
    }
  }
  const now = new Date();
  // Jour entièrement passé ou à moins de 5 h : inutile d'interroger la base, on explique pourquoi.
  const tooSoon = day !== null && isTooSoonDay(day, now);
  const slots = useAsync(day === null || tooSoon ? null : `slots|${serviceId}|${day}`, () =>
    getAvailableSlots(serviceId, day ?? ""),
  );

  const today = parisDayKey(now);
  const days = calendarDays(now);

  // Jours qui ont au moins un créneau, en UNE requête (et non une par jour). En cas d'échec, on
  // ne bloque rien : le calendrier reste utilisable, sans grisé (`counts` vaut null).
  const availability = useAsync(`days|${serviceId}`, () => getAvailableDays(serviceId));
  const counts = availability.status === "success" ? countByDay(availability.data) : null;
  const noDayAvailable = counts !== null && !hasAvailableDay(days, counts);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (slot === null) {
      setError(day === null ? "Choisis un jour, puis un créneau." : "Choisis un créneau.");
      return;
    }
    props.onNext();
  }

  if (noDayAvailable) {
    return (
      <StepFrame number={2} title="Quel jour, quelle heure ?" focusOnMount={focusOnMount}>
        {notice && <ErrorMessage>{notice}</ErrorMessage>}
        <EmptyMessage>
          <p className="font-semibold">
            Aucun créneau disponible pour le moment, contacte Alix sur Instagram.
          </p>
          <p>
            <InstagramLink />
          </p>
        </EmptyMessage>
        <StepActions onBack={props.onBack} submitLabel="Continuer" hideSubmit />
      </StepFrame>
    );
  }

  return (
    <StepFrame number={2} title="Quel jour, quelle heure ?" focusOnMount={focusOnMount}>
      {notice && <ErrorMessage>{notice}</ErrorMessage>}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-lg font-semibold">Jour</legend>
          <p className="text-muted">
            On réserve au plus tard {BOOKING_RULES.minNoticeHours} h avant le rendez-vous, et
            jusqu'à {BOOKING_RULES.maxAdvanceDays / 7} semaines à l'avance.
          </p>
          {availability.status === "error" && (
            <ErrorMessage onRetry={availability.reload}>
              Impossible de vérifier les jours disponibles. Tu peux quand même choisir un jour.
            </ErrorMessage>
          )}
          {availability.status === "loading" && (
            <LoadingMessage>Chargement des jours disponibles…</LoadingMessage>
          )}
          {availability.status !== "loading" && (
            <>
              <div
                aria-hidden="true"
                className="grid grid-cols-7 gap-0.5 text-center text-sm text-muted"
              >
                {WEEKDAY_HEADERS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {/* Cases vides avant aujourd'hui, pour aligner les jours sous leur colonne. */}
                {Array.from({ length: isoWeekday(today) - 1 }, (_, i) => (
                  <span key={`vide-${i}`} aria-hidden="true" />
                ))}
                {days.map((key, index) => {
                  const { dayNumber, shortMonth } = dayKeyParts(key);
                  const showMonth = index === 0 || dayNumber === "1";
                  const count = counts?.get(key);
                  const unavailable = counts !== null && (count ?? 0) === 0;
                  return (
                    <label
                      key={key}
                      className={
                        counts === null
                          ? DAY_UNKNOWN
                          : unavailable
                            ? DAY_UNAVAILABLE
                            : DAY_AVAILABLE
                      }
                      onClick={unavailable ? undefined : revealSlots}
                    >
                      <input
                        type="radio"
                        name="day"
                        value={key}
                        checked={day === key}
                        onChange={() => {
                          props.onDayChange(key);
                          setError(undefined);
                        }}
                        disabled={unavailable && day !== key}
                        aria-label={dayLabel(key, counts === null ? undefined : (count ?? 0))}
                        className="sr-only"
                      />
                      <span aria-hidden="true" className="font-semibold">
                        {dayNumber}
                      </span>
                      {showMonth && (
                        <span aria-hidden="true" className="text-[0.8125rem]">
                          {shortMonth}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </fieldset>

        <div ref={slotsRef} className="flex flex-col gap-3">
          <SlotList
            day={day}
            firstDay={tooSoon ? firstBookableDay(now) : null}
            state={slots}
            selected={slot}
            error={error}
            onSelect={(chosen) => {
              props.onSlotChange(chosen);
              setError(undefined);
            }}
          />
          <GroupError id="slot-error" message={error} />
        </div>

        <StepActions onBack={props.onBack} submitLabel="Continuer" />
      </form>
    </StepFrame>
  );
}

type SlotListProps = {
  day: DayKey | null;
  /** Renseigné quand le jour choisi est déjà passé ou trop proche : premier jour possible. */
  firstDay: DayKey | null;
  state: AsyncResult<AvailableSlot[]>;
  selected: AvailableSlot | null;
  error?: string;
  onSelect: (slot: AvailableSlot) => void;
};

/** Créneaux du jour choisi, avec les états chargement, erreur et « aucun créneau ». */
function SlotList({ day, firstDay, state, selected, error, onSelect }: SlotListProps) {
  if (day !== null && firstDay !== null) {
    return (
      <EmptyMessage>
        <p className="font-semibold">Trop tard pour réserver le {formatDayKey(day)}.</p>
        <p>
          On réserve au plus tard {BOOKING_RULES.minNoticeHours} h avant. Choisis un jour à partir
          du {formatDayKey(firstDay)}.
        </p>
      </EmptyMessage>
    );
  }
  if (day === null || state.status === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted">Choisis un jour pour voir les créneaux libres.</p>
      </div>
    );
  }
  if (state.status === "loading") return <LoadingMessage>Chargement des créneaux…</LoadingMessage>;
  if (state.status === "error") {
    return (
      <ErrorMessage onRetry={state.reload}>
        Impossible de charger les créneaux. Vérifie ta connexion, puis réessaie.
      </ErrorMessage>
    );
  }

  const slots = state.data;
  if (slots.length === 0) {
    return (
      <EmptyMessage>
        <p className="font-semibold">Aucun créneau libre le {formatDayKey(day)}.</p>
        <p>Essaie un autre jour.</p>
      </EmptyMessage>
    );
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? "slot-error" : undefined}>
      <legend className="mb-2 text-lg font-semibold">Créneaux libres le {formatDayKey(day)}</legend>
      {slots.map((s) => (
        <Choice
          key={s.startsAt}
          type="radio"
          name="slot"
          value={s.startsAt}
          checked={selected?.startsAt === s.startsAt}
          onChange={() => onSelect(s)}
        >
          <span className="font-semibold">
            {formatTime(s.startsAt)} – {formatTime(s.endsAt)}
          </span>
          <span className="text-sm text-muted">{s.locationLabel}</span>
        </Choice>
      ))}
    </fieldset>
  );
}
