import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bookingData from "@/features/booking/data";
import { firstBookableDay } from "@/features/booking/notice";
import { formatDayKey, parisDayKey } from "@/lib/dates";
import { BookingPage } from "@/pages/BookingPage";

/**
 * États du parcours difficiles à provoquer en e2e (chargement, erreurs, créneau perdu) : on
 * remplace ici les fonctions de la couche données par des simulations.
 */
vi.mock("@/features/booking/data", async (importOriginal) => {
  const original = await importOriginal<typeof bookingData>();
  return {
    ...original,
    getServices: vi.fn(),
    getAvailableSlots: vi.fn(),
    createBooking: vi.fn(),
  };
});

const SERVICE = { id: "s1", name: "Coupe", durationMin: 60, priceLabel: null };
const SLOT = {
  startsAt: "2030-01-15T13:00:00.000Z",
  endsAt: "2030-01-15T14:00:00.000Z",
  locationId: "l1",
  locationLabel: "Saint-Christophe-du-Bois",
};
const OTHER_SLOT = {
  startsAt: "2030-01-15T14:10:00.000Z",
  endsAt: "2030-01-15T15:10:00.000Z",
  locationId: "l1",
  locationLabel: "Saint-Christophe-du-Bois",
};
const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";

function renderPage() {
  return render(
    <MemoryRouter>
      <BookingPage />
    </MemoryRouter>,
  );
}

/** Case du calendrier du premier jour réservable (au-delà des 48 h). */
function firstBookableDayRadio() {
  return screen.getByRole("radio", { name: formatDayKey(firstBookableDay(new Date())) });
}

beforeEach(() => {
  vi.mocked(bookingData.getServices).mockReset();
  vi.mocked(bookingData.getAvailableSlots).mockReset();
  vi.mocked(bookingData.createBooking).mockReset();
});

/** Prestation → jour → créneau → coordonnées → récapitulatif. */
async function goToSummary(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.click(firstBookableDayRadio());
  await user.click(await screen.findByRole("radio", { name: /14:00 – 15:00/ }));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.type(screen.getByLabelText("Prénom"), "Zoé");
  await user.type(screen.getByLabelText("Nom"), "Durand");
  await user.type(screen.getByLabelText("Téléphone"), "0639980010");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
}

describe("BookingPage : chargement et erreurs", () => {
  it("affiche le chargement, puis une erreur avec « Réessayer », puis les prestations", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices)
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce([SERVICE]);
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Chargement des prestations…");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Impossible de charger/);

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("radio", { name: /Coupe/ })).toBeInTheDocument();
  });

  it("affiche « Aucune prestation disponible » si la liste est vide, sans formulaire", async () => {
    vi.mocked(bookingData.getServices).mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText("Aucune prestation disponible pour l'instant."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuer" })).not.toBeInTheDocument();
  });

  it("affiche une erreur de chargement des créneaux et permet de réessayer", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots)
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce([SLOT]);
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(firstBookableDayRadio());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Impossible de charger les créneaux/,
    );
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    // Le créneau affiche le libellé public de son lieu.
    expect(
      await screen.findByRole("radio", { name: /14:00 – 15:00\s*Saint-Christophe-du-Bois/ }),
    ).toBeInTheDocument();
  });
});

describe("BookingPage : délai de 48 h", () => {
  it("explique la règle, et n'interroge pas la base pour un jour à moins de 48 h", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText(/On réserve au plus tard 48 h avant le rendez-vous/)).toBeVisible();

    const today = parisDayKey(new Date());
    await user.click(screen.getByRole("radio", { name: formatDayKey(today) }));
    expect(screen.getByText(`Trop tard pour réserver le ${formatDayKey(today)}.`)).toBeVisible();
    expect(
      screen.getByText(
        new RegExp(`Choisis un jour à partir du ${formatDayKey(firstBookableDay(new Date()))}`),
      ),
    ).toBeVisible();
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
  });
});

describe("BookingPage : envoi de la réservation", () => {
  it("créneau pris entre-temps : retour au choix du créneau, liste relue sans lui", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots)
      .mockResolvedValueOnce([SLOT, OTHER_SLOT])
      .mockResolvedValueOnce([OTHER_SLOT]);
    vi.mocked(bookingData.createBooking).mockRejectedValue(
      new bookingData.BookingError("slot_unavailable"),
    );
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    expect(
      await screen.findByText("Ce créneau n'est plus disponible. Choisis-en un autre."),
    ).toBeVisible();
    expect(await screen.findByRole("radio", { name: /15:10 – 16:10/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /14:00 – 15:00/ })).not.toBeInTheDocument();
    expect(bookingData.getAvailableSlots).toHaveBeenCalledTimes(2);
  });

  it("limite atteinte : message sobre, qui ne confirme pas l'existence d'autres RDV", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockRejectedValue(
      new bookingData.BookingError("limit_reached"),
    );
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Réservation impossible avec ces coordonnées/);
    expect(alert).not.toHaveTextContent(/déjà 2|avec ce téléphone/);
  });

  it("réseau coupé : on reste sur le récapitulatif avec un message et on peut réessayer", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockRejectedValue(new bookingData.BookingError("unknown"));
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Vérifie ta connexion/);
    expect(screen.getByRole("button", { name: "Confirmer la réservation" })).toBeEnabled();
  });

  it("confirmation : date, prestation, ville et lien d'annulation, sans adresse", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockResolvedValue({
      startsAt: SLOT.startsAt,
      endsAt: SLOT.endsAt,
      serviceName: "Coupe",
      locationLabel: "Saint-Christophe-du-Bois",
      cancelToken: TOKEN,
    });
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(screen.getByText("mardi 15 janvier")).toBeVisible();
    expect(screen.getByText("14:00 – 15:00")).toBeVisible();
    expect(screen.getByText("Saint-Christophe-du-Bois")).toBeVisible();
    expect(screen.getByText(/Tu ne recevras pas d'e-mail de confirmation/)).toBeVisible();
    expect(screen.getByText(new RegExp(`/annuler#${TOKEN}`))).toBeVisible();
    expect(screen.queryByText("Adresse")).not.toBeInTheDocument();
  });
});
