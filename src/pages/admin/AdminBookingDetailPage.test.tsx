import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as data from "@/features/admin/data";
import type { AdminBookingDetails } from "@/features/admin/data";
import { AdminBookingDetailPage } from "@/pages/admin/AdminBookingDetailPage";

/**
 * Détail d'un rendez-vous et annulation par Alix, couche données simulée. « Maintenant » est
 * fixé au mardi 13 octobre 2026, 8 h à Paris. Coordonnées FICTIVES (plage 06 39 98 de l'ARCEP).
 */
vi.mock("@/features/admin/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/data")>()),
  getAdminBooking: vi.fn(),
  cancelAdminBooking: vi.fn(),
}));

const NOW = new Date("2026-10-13T06:00:00Z");
const ID = "60000000-0000-4000-8000-000000000001";
const BOOKING: AdminBookingDetails = {
  id: ID,
  status: "confirmed",
  cancelledBy: null,
  startsAt: "2026-10-13T12:00:00Z", // aujourd'hui 14 h : moins de 24 h, annulable par Alix
  endsAt: "2026-10-13T13:00:00Z",
  serviceName: "Coupe + barbe",
  locationLabel: "Angers",
  firstName: "Léa",
  lastName: "Martin",
  phone: "0639980001",
  email: "lea@example.test",
};

const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
  vi.spyOn(console, method),
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  consoleSpies.forEach((spy) => spy.mockClear());
  vi.mocked(data.getAdminBooking).mockReset().mockResolvedValue(BOOKING);
  vi.mocked(data.cancelAdminBooking).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  // Aucune donnée du client dans la console.
  const written = consoleSpies.flatMap((spy) => spy.mock.calls).map((a) => JSON.stringify(a));
  expect(written.filter((l) => /Martin|0639980001|example\.test/.test(l))).toEqual([]);
});

function renderAt(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/admin/rendez-vous/${id}`]}>
      <Routes>
        <Route path="/admin/rendez-vous/:id" element={<AdminBookingDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("AdminBookingDetailPage", () => {
  it("affiche date, prestation, ville, client et les liens Appeler / SMS / E-mail", async () => {
    renderAt();

    expect(await screen.findByRole("heading", { level: 2, name: "Léa Martin" })).toBeVisible();
    expect(data.getAdminBooking).toHaveBeenCalledWith(ID);
    expect(screen.getByText("mardi 13 octobre")).toBeVisible();
    expect(screen.getByText("14:00 – 15:00")).toBeVisible();
    expect(screen.getByText("Coupe + barbe · Angers")).toBeVisible();
    expect(screen.getByText("06 39 98 00 01")).toBeVisible();
    expect(screen.getByRole("link", { name: "Appeler" })).toHaveAttribute("href", "tel:0639980001");
    expect(screen.getByRole("link", { name: "SMS" })).toHaveAttribute("href", "sms:0639980001");
    expect(screen.getByRole("link", { name: "E-mail" })).toHaveAttribute(
      "href",
      "mailto:lea@example.test",
    );
  });

  it("client sans téléphone : ni Appeler ni SMS, l'e-mail reste", async () => {
    vi.mocked(data.getAdminBooking).mockResolvedValue({ ...BOOKING, phone: null });
    renderAt();
    await screen.findByRole("heading", { level: 2, name: "Léa Martin" });
    expect(screen.queryByRole("link", { name: "Appeler" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "SMS" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "E-mail" })).toBeVisible();
  });

  it("annule après une confirmation explicite, même à moins de 24 h", async () => {
    vi.mocked(data.cancelAdminBooking).mockResolvedValue(undefined);
    const u = user();
    renderAt();

    await u.click(await screen.findByRole("button", { name: "Annuler le rendez-vous" }));
    expect(
      screen.getByText(
        "Annuler le rendez-vous de Léa le mardi 13 octobre à 14:00 ? Le client n'est pas prévenu : contacte-le.",
      ),
    ).toBeVisible();
    expect(data.cancelAdminBooking).not.toHaveBeenCalled();

    vi.mocked(data.getAdminBooking).mockResolvedValue({
      ...BOOKING,
      status: "cancelled",
      cancelledBy: "barber",
    });
    await u.click(screen.getByRole("button", { name: "Oui, annuler" }));

    expect(data.cancelAdminBooking).toHaveBeenCalledWith(ID);
    expect(
      await screen.findByText(/Rendez-vous annulé, le créneau est de nouveau proposé/),
    ).toBeVisible();
    expect(screen.getByText(/contacte Léa/).closest("[tabindex]")).toHaveFocus();
    expect(screen.getByText("Annulé par toi")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Annuler le rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("garder le rendez-vous : rien n'est envoyé", async () => {
    const u = user();
    renderAt();
    await u.click(await screen.findByRole("button", { name: "Annuler le rendez-vous" }));
    await u.click(screen.getByRole("button", { name: "Garder le rendez-vous" }));
    expect(screen.getByRole("button", { name: "Annuler le rendez-vous" })).toBeVisible();
    expect(data.cancelAdminBooking).not.toHaveBeenCalled();
  });

  it("double clic : une seule annulation envoyée", async () => {
    let resolve!: () => void;
    vi.mocked(data.cancelAdminBooking).mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const u = user();
    renderAt();
    await u.click(await screen.findByRole("button", { name: "Annuler le rendez-vous" }));
    const confirm = screen.getByRole("button", { name: "Oui, annuler" });

    await u.dblClick(confirm);
    expect(data.cancelAdminBooking).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Annulation en cours…" })).toBeDisabled();
    resolve();
  });

  it("RDV commencé entre-temps : message fixe, rien d'autre", async () => {
    vi.mocked(data.cancelAdminBooking).mockRejectedValue(new data.AdminError("already_started"));
    const u = user();
    renderAt();
    await u.click(await screen.findByRole("button", { name: "Annuler le rendez-vous" }));
    await u.click(screen.getByRole("button", { name: "Oui, annuler" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ce rendez-vous a déjà commencé : il ne peut plus être annulé.",
    );
  });

  it("RDV commencé ou annulé : pas de bouton d'annulation", async () => {
    vi.mocked(data.getAdminBooking).mockResolvedValue({
      ...BOOKING,
      startsAt: "2026-10-13T05:30:00Z",
      endsAt: "2026-10-13T06:30:00Z",
    });
    const { unmount } = renderAt();
    await screen.findByRole("heading", { level: 2, name: "Léa Martin" });
    expect(
      screen.queryByRole("button", { name: "Annuler le rendez-vous" }),
    ).not.toBeInTheDocument();
    unmount();

    vi.mocked(data.getAdminBooking).mockResolvedValue({
      ...BOOKING,
      status: "cancelled",
      cancelledBy: "client",
    });
    renderAt();
    expect(await screen.findByText("Annulé par le client")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Annuler le rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("identifiant mal formé : « n'existe pas », sans requête ; inconnu : même message", async () => {
    const { unmount } = renderAt("pas-un-uuid");
    expect(screen.getByRole("alert")).toHaveTextContent("Ce rendez-vous n'existe pas");
    expect(data.getAdminBooking).not.toHaveBeenCalled();
    unmount();

    vi.mocked(data.getAdminBooking).mockRejectedValue(new data.AdminError("not_found"));
    renderAt();
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce rendez-vous n'existe pas");
  });

  it("le titre de la page ne contient pas le nom du client", async () => {
    renderAt();
    await screen.findByRole("heading", { level: 2, name: "Léa Martin" });
    expect(document.title).not.toMatch(/Léa|Martin/);
  });
});
