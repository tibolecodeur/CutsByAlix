import { useState } from "react";
import { Button } from "@/components/Button";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import { countConfirmed, describeCount, groupByParisDay } from "@/features/admin/bookings";
import { getAdminBookings, type AdminBookingsScope } from "@/features/admin/data";
import { formatDayKey } from "@/lib/dates";
import { useAsync } from "@/lib/useAsync";
import { AdminBookingCard } from "@/pages/admin/AdminBookingCard";

const SCOPES: { scope: AdminBookingsScope; label: string; suffix: string; empty: string }[] = [
  {
    scope: "upcoming",
    label: "À venir",
    suffix: "à venir",
    empty: "Aucun rendez-vous à venir.",
  },
  {
    scope: "past",
    label: "Passées",
    suffix: "ces 30 derniers jours",
    empty: "Aucun rendez-vous ces 30 derniers jours.",
  },
];

/**
 * Rendez-vous des clients : « À venir » (par jour, aujourd'hui mis en avant) et « Passées »
 * (30 derniers jours). Le choix de l'onglet reste dans l'état du composant, jamais dans
 * l'URL ; aucune recherche ni exportation (minimisation RGPD).
 */
export function AdminBookingsPage() {
  const [scope, setScope] = useState<AdminBookingsScope>("upcoming");
  const current = SCOPES.find((s) => s.scope === scope)!;
  const bookings = useAsync(`admin-bookings|${scope}`, () => getAdminBookings(scope));
  const now = new Date();

  return (
    <>
      <PageMeta title="Rendez-vous" description="Rendez-vous des clients." />
      <Section variant="blush">
        <h1>Rendez-vous</h1>
        {/* Deux boutons à bascule (aria-pressed) : lus « bouton, enfoncé » pour l'onglet actif. */}
        <div className="flex gap-3" role="group" aria-label="Période">
          {SCOPES.map((s) => (
            <Button
              key={s.scope}
              variant={s.scope === scope ? "primary" : "secondary"}
              aria-pressed={s.scope === scope}
              onClick={() => setScope(s.scope)}
              className="flex-1 sm:flex-none"
            >
              {s.label}
            </Button>
          ))}
        </div>
      </Section>
      <Section>
        {bookings.status === "loading" && (
          <LoadingMessage>Chargement des rendez-vous…</LoadingMessage>
        )}
        {bookings.status === "error" && (
          <ErrorMessage onRetry={bookings.reload}>
            Impossible de charger les rendez-vous. Vérifie ta connexion, puis réessaie.
          </ErrorMessage>
        )}
        {bookings.status === "success" && (
          <>
            <p role="status" className="font-semibold">
              {describeCount(countConfirmed(bookings.data), current.suffix)}
            </p>
            {bookings.data.length === 0 ? (
              <EmptyMessage>
                <p>{current.empty}</p>
              </EmptyMessage>
            ) : (
              groupByParisDay(bookings.data, now).map((group) => (
                <section
                  key={group.day}
                  aria-labelledby={`jour-${group.day}`}
                  className={
                    group.isToday
                      ? "flex flex-col gap-3 border-2 border-ink bg-blush p-4"
                      : "flex flex-col gap-3"
                  }
                >
                  <h2 id={`jour-${group.day}`} className="text-3xl first-letter:uppercase">
                    {group.isToday
                      ? `Aujourd'hui, ${formatDayKey(group.day)}`
                      : formatDayKey(group.day)}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {group.bookings.map((booking) => (
                      <AdminBookingCard key={booking.id} booking={booking} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </Section>
    </>
  );
}
