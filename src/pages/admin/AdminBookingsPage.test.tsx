import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as data from "@/features/admin/data";
import type { AdminBooking } from "@/features/admin/data";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";

/**
 * Listes « Rendez-vous » et tableau de bord, couche données simulée. « Maintenant » est fixé
 * au mardi 13 octobre 2026, 8 h à Paris : rien ne dépend de la date du jour. Clients fictifs.
 */
vi.mock("@/features/admin/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/data")>()),
  getAdminBookings: vi.fn(),
}));

const NOW = new Date("2026-10-13T06:00:00Z");

function booking(id: string, startsAt: string, fields: Partial<AdminBooking> = {}): AdminBooking {
  return {
    id,
    status: "confirmed",
    cancelledBy: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    serviceName: "Coupe",
    locationLabel: "Angers",
    firstName: "Léa",
    lastName: "Martin",
    ...fields,
  };
}

const UPCOMING = [
  booking("60000000-0000-4000-8000-000000000001", "2026-10-13T07:00:00Z"), // aujourd'hui 9 h
  booking("60000000-0000-4000-8000-000000000002", "2026-10-15T08:00:00Z", {
    firstName: "Tom",
    lastName: "Durand",
    status: "cancelled",
    cancelledBy: "barber",
  }),
  booking("60000000-0000-4000-8000-000000000003", "2026-10-15T12:00:00Z", {
    firstName: "Noé",
    lastName: "Roux",
    serviceName: "Coupe + barbe",
  }),
];
const PAST = [
  booking("60000000-0000-4000-8000-000000000004", "2026-10-10T08:00:00Z", {
    firstName: "Ana",
    lastName: "Blanc",
    status: "cancelled",
    cancelledBy: "client",
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(data.getAdminBookings).mockReset();
  vi.mocked(data.getAdminBookings).mockImplementation((scope) =>
    Promise.resolve(scope === "upcoming" ? UPCOMING : PAST),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage(page: React.ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("AdminBookingsPage", () => {
  it("« À venir » : compteur des confirmés, jours de Paris, aujourd'hui mis en avant", async () => {
    renderPage(<AdminBookingsPage />);

    expect(await screen.findByText("2 rendez-vous confirmés à venir")).toBeVisible();
    expect(data.getAdminBookings).toHaveBeenCalledWith("upcoming");
    const today = screen.getByRole("region", { name: "Aujourd'hui, mardi 13 octobre" });
    expect(within(today).getByRole("link", { name: /09:00 – 10:00\s*Léa Martin/ })).toHaveAttribute(
      "href",
      "/admin/rendez-vous/60000000-0000-4000-8000-000000000001",
    );
    const thursday = screen.getByRole("region", { name: "jeudi 15 octobre" });
    expect(within(thursday).getAllByRole("listitem")).toHaveLength(2);
    expect(within(thursday).getByText("Annulé par toi")).toBeVisible();
    expect(within(thursday).getByText("Coupe + barbe · Angers")).toBeVisible();
    expect(screen.getByRole("button", { name: "À venir" })).toHaveAttribute("aria-pressed", "true");
  });

  it("aucune coordonnée du client dans la liste (téléphone, e-mail)", async () => {
    const { container } = renderPage(<AdminBookingsPage />);
    await screen.findByText("2 rendez-vous confirmés à venir");
    expect(
      container.querySelector('a[href^="tel:"], a[href^="sms:"], a[href^="mailto:"]'),
    ).toBeNull();
  });

  it("« Passées » : 30 derniers jours, sans changer l'URL", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<AdminBookingsPage />);
    await screen.findByText("2 rendez-vous confirmés à venir");

    await user.click(screen.getByRole("button", { name: "Passées" }));

    expect(
      await screen.findByText("Aucun rendez-vous confirmé ces 30 derniers jours"),
    ).toBeVisible();
    expect(data.getAdminBookings).toHaveBeenLastCalledWith("past");
    expect(screen.getByText("Ana Blanc")).toBeVisible();
    expect(screen.getByText("Annulé par le client")).toBeVisible();
    expect(screen.getByRole("button", { name: "Passées" })).toHaveAttribute("aria-pressed", "true");
  });

  it("message quand il n'y a rien", async () => {
    vi.mocked(data.getAdminBookings).mockResolvedValue([]);
    renderPage(<AdminBookingsPage />);
    expect(await screen.findByText("Aucun rendez-vous à venir.")).toBeVisible();
  });

  it("erreur : message fixe et « Réessayer »", async () => {
    vi.mocked(data.getAdminBookings).mockRejectedValueOnce(new data.AdminError("unknown"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage(<AdminBookingsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger les rendez-vous.",
    );
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("2 rendez-vous confirmés à venir")).toBeVisible();
  });
});

describe("AdminDashboardPage", () => {
  it("aujourd'hui puis 7 jours, confirmés seulement, à partir d'une seule requête", async () => {
    renderPage(<AdminDashboardPage />);

    const today = await screen.findByRole("heading", { level: 2, name: "Aujourd'hui" });
    const todaySection = today.closest("section")!;
    expect(await within(todaySection).findByText("Léa Martin")).toBeVisible();
    const next = screen.getByRole("heading", { level: 2, name: "Les 7 prochains jours" });
    const nextSection = next.closest("section")!;
    expect(within(nextSection).getByText("Noé Roux")).toBeVisible();
    expect(screen.queryByText("Tom Durand")).not.toBeInTheDocument(); // annulé
    expect(data.getAdminBookings).toHaveBeenCalledTimes(1);
    expect(data.getAdminBookings).toHaveBeenCalledWith("upcoming");
  });
});
