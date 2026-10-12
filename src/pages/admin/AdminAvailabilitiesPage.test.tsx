import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as data from "@/features/admin/data";
import { AdminAvailabilitiesPage } from "@/pages/admin/AdminAvailabilitiesPage";

/**
 * Écran « Disponibilités », couche données simulée. « Maintenant » est fixé au lundi 4 mars
 * 2030, 9 h à Paris : rien ne dépend de la date du jour.
 */
vi.mock("@/features/admin/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/data")>()),
  getBookingRules: vi.fn(),
  getLocations: vi.fn(),
  getAvailabilities: vi.fn(),
  createAvailability: vi.fn(),
  deleteAvailability: vi.fn(),
}));

const NOW = new Date("2030-03-04T08:00:00Z");
const RULES = { slotStepMin: 70, minNoticeMin: 2880, maxAdvanceDays: 28 };
const PONTS_DE_CE = { id: "20000000-0000-4000-8000-000000000001", publicLabel: "Les Ponts-de-Cé" };
const OTHER = {
  id: "20000000-0000-4000-8000-000000000002",
  publicLabel: "Saint-Christophe-du-Bois",
};
const AVAILABILITY = {
  id: "50000000-0000-4000-8000-000000000001",
  locationId: PONTS_DE_CE.id,
  locationLabel: "Les Ponts-de-Cé",
  startsAt: "2030-03-06T09:00:00Z", // mercredi 6 mars, 10 h à Paris
  endsAt: "2030-03-06T12:30:00Z",
  slotCount: 3,
  bookingCount: 1,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.mocked(data.getBookingRules).mockResolvedValue(RULES);
  vi.mocked(data.getLocations).mockResolvedValue([PONTS_DE_CE, OTHER]);
  vi.mocked(data.getAvailabilities).mockResolvedValue([AVAILABILITY]);
  vi.mocked(data.createAvailability).mockReset();
  vi.mocked(data.deleteAvailability).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminAvailabilitiesPage />
    </MemoryRouter>,
  );
}

/** Saisit jour et heures (les champs date / heure se remplissent par un événement change). */
function fillRange(day: string, from: string, to: string) {
  fireEvent.change(screen.getByLabelText("Jour"), { target: { value: day } });
  fireEvent.change(screen.getByLabelText("Début"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("Fin"), { target: { value: to } });
}

describe("AdminAvailabilitiesPage", () => {
  it("liste les plages par semaine avec heures de Paris, lieu, créneaux et réservations", async () => {
    renderPage();
    const week = await screen.findByRole("region", { name: "Semaine du lundi 4 mars" });
    const item = within(week).getByRole("listitem");
    expect(item).toHaveTextContent("mercredi 6 mars");
    expect(item).toHaveTextContent("10:00 – 13:30 · Les Ponts-de-Cé");
    expect(item).toHaveTextContent("3 créneaux · 1 réservation");
  });

  it("aperçu en direct des créneaux et de la période réservable (règles lues en base)", async () => {
    renderPage();
    await screen.findByRole("radio", { name: "Les Ponts-de-Cé" });
    fillRange("2030-03-08", "10:00", "13:30");

    const preview = screen.getByTestId("slot-preview");
    expect(preview).toHaveTextContent("3 créneaux : 10:00, 11:10, 12:20");
    expect(preview).toHaveTextContent(
      "Réservable par les clients dès maintenant jusqu'au mercredi 6 mars à 12:20.",
    );

    // Plage lointaine : ouverture 28 jours avant le premier créneau.
    fillRange("2030-05-01", "10:00", "12:20");
    expect(preview).toHaveTextContent(
      "Réservable par les clients du mercredi 3 avril à 10:00 jusqu'au lundi 29 avril à 11:10.",
    );

    // Demain : à moins de 48 h, jamais proposée.
    fillRange("2030-03-05", "10:00", "13:30");
    expect(preview).toHaveTextContent("Ne sera jamais proposée aux clients");

    fillRange("2030-03-08", "10:00", "11:00");
    expect(preview).toHaveTextContent("La plage doit durer au moins 70 min (un créneau).");
  });

  it("suit les règles reçues : un autre pas change l'aperçu (rien n'est codé en dur)", async () => {
    vi.mocked(data.getBookingRules).mockResolvedValue({ ...RULES, slotStepMin: 60 });
    renderPage();
    await screen.findByRole("radio", { name: "Les Ponts-de-Cé" });
    fillRange("2030-03-08", "10:00", "13:30");
    expect(screen.getByTestId("slot-preview")).toHaveTextContent(
      "3 créneaux : 10:00, 11:00, 12:00",
    );
  });

  it("crée la plage avec les instants absolus et traduit un chevauchement", async () => {
    const user = userEvent.setup();
    vi.mocked(data.createAvailability)
      .mockResolvedValueOnce({ ...AVAILABILITY, id: "nouvelle", bookingCount: 0 })
      .mockRejectedValueOnce(new data.AdminError("availability_overlap"));
    renderPage();
    await user.click(await screen.findByRole("radio", { name: "Les Ponts-de-Cé" }));
    fillRange("2030-03-06", "10:00", "13:30");
    await user.click(screen.getByRole("button", { name: "Ajouter la disponibilité" }));

    expect(data.createAvailability).toHaveBeenCalledWith({
      locationId: PONTS_DE_CE.id,
      startsAt: "2030-03-06T09:00:00.000Z",
      endsAt: "2030-03-06T12:30:00.000Z",
    });
    expect(await screen.findByText(/Disponibilité ajoutée/)).toHaveTextContent("(3 créneaux)");

    await user.click(screen.getByRole("button", { name: "Ajouter la disponibilité" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cette plage chevauche une autre disponibilité (tous lieux confondus).",
    );
  });

  it("demande un lieu avant d'envoyer", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("radio", { name: "Les Ponts-de-Cé" });
    await user.click(screen.getByRole("button", { name: "Ajouter la disponibilité" }));
    expect(screen.getByText("Choisis un lieu.")).toBeInTheDocument();
    expect(data.createAvailability).not.toHaveBeenCalled();
  });

  it("suppression refusée : message clair, la plage reste", async () => {
    const user = userEvent.setup();
    vi.mocked(data.deleteAvailability).mockRejectedValue(
      new data.AdminError("availability_has_bookings"),
    );
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: /Supprimer la disponibilité du mercredi 6 mars/ }),
    );
    await user.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Des rendez-vous sont prévus sur cette plage : annule-les d'abord",
    );
    expect(screen.getByText("3 créneaux · 1 réservation", { exact: false })).toBeInTheDocument();
  });

  it("aucun lieu actif : explication, pas de formulaire, aucun moyen d'en créer", async () => {
    vi.mocked(data.getLocations).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Aucun lieu actif" })).toBeInTheDocument();
    expect(screen.getByText(/Les lieux sont activés par le développeur/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter la disponibilité" })).toBeNull();
    expect(screen.queryByLabelText("Jour")).toBeNull();
  });

  it("n'affiche que le libellé public des lieux", async () => {
    renderPage();
    const pontsDeCe = await screen.findByRole("radio", { name: "Les Ponts-de-Cé" });
    expect(pontsDeCe.closest("label")).toHaveTextContent(/^Les Ponts-de-Cé$/);
  });
});
