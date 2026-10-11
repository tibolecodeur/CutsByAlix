import { ButtonLink } from "@/components/Button";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import { splitForDashboard } from "@/features/admin/bookings";
import { getAdminBookings, type AdminBooking } from "@/features/admin/data";
import { formatDayKey, parisDayKey } from "@/lib/dates";
import { useAsync, type AsyncResult } from "@/lib/useAsync";
import { AdminBookingCard } from "@/pages/admin/AdminBookingCard";

/** Nombre de jours affichés après aujourd'hui. */
const UPCOMING_DAYS = 7;

/**
 * Tableau de bord : RDV confirmés du jour, puis ceux des 7 prochains jours. Une seule requête
 * (« À venir », sans contact client), découpée côté écran.
 */
export function AdminDashboardPage() {
  const now = new Date();
  const today = parisDayKey(now);
  const bookings = useAsync(`dashboard|${today}`, () => getAdminBookings("upcoming"));
  const split =
    bookings.status === "success" ? splitForDashboard(bookings.data, now, UPCOMING_DAYS) : null;

  return (
    <>
      <PageMeta title="Tableau de bord" description="Rendez-vous du jour et à venir." />
      <Section variant="blush">
        <h1>Tableau de bord</h1>
        <p className="first-letter:uppercase">{formatDayKey(today)}</p>
        <p>
          <ButtonLink to="/admin/disponibilites" className="w-full sm:w-auto">
            Ajouter une disponibilité
          </ButtonLink>
        </p>
      </Section>
      <Section>
        <BookingList
          title="Aujourd'hui"
          state={bookings}
          list={split?.today}
          empty="Aucun rendez-vous aujourd'hui."
        />
        <BookingList
          title={`Les ${UPCOMING_DAYS} prochains jours`}
          state={bookings}
          list={split?.upcoming}
          empty={`Aucun rendez-vous dans les ${UPCOMING_DAYS} prochains jours.`}
          showDay
        />
        <p>
          <ButtonLink to="/admin/rendez-vous" variant="secondary" className="w-full sm:w-auto">
            Tous les rendez-vous
          </ButtonLink>
        </p>
      </Section>
    </>
  );
}

type BookingListProps = {
  title: string;
  state: AsyncResult<AdminBooking[]>;
  /** Partie de la réponse à afficher (connue une fois la requête réussie). */
  list: AdminBooking[] | undefined;
  empty: string;
  showDay?: boolean;
};

function BookingList({ title, state, list, empty, showDay = false }: BookingListProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-3xl">{title}</h2>
      {state.status === "loading" && <LoadingMessage>Chargement des rendez-vous…</LoadingMessage>}
      {state.status === "error" && (
        <ErrorMessage onRetry={state.reload}>Impossible de charger les rendez-vous.</ErrorMessage>
      )}
      {list &&
        (list.length === 0 ? (
          <EmptyMessage>
            <p>{empty}</p>
          </EmptyMessage>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((booking) => (
              <AdminBookingCard key={booking.id} booking={booking} showDay={showDay} />
            ))}
          </ul>
        ))}
    </section>
  );
}
