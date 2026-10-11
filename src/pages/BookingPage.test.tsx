import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as bookingData from "@/features/booking/data";
import { firstBookableDay } from "@/features/booking/notice";
import { formatDayKey } from "@/lib/dates";
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

/** Case du calendrier du premier jour réservable (au-delà du délai de 5 h). */
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

describe("BookingPage : délai de 5 h", () => {
  // Seule `Date` est figée (userEvent et findBy gardent leurs vrais timers).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function openSlotStep(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
  }

  it("19 h 01 : explique la règle, aujourd'hui est refusé sans interroger la base", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-13T17:01:00Z")); // mardi 13, 19 h 01 à Paris
    await openSlotStep(user);
    expect(screen.getByText(/On réserve au plus tard 5 h avant le rendez-vous/)).toBeVisible();

    await user.click(screen.getByRole("radio", { name: formatDayKey("2026-10-13") }));
    expect(
      screen.getByText(`Trop tard pour réserver le ${formatDayKey("2026-10-13")}.`),
    ).toBeVisible();
    expect(
      screen.getByText(new RegExp(`Choisis un jour à partir du ${formatDayKey("2026-10-14")}`)),
    ).toBeVisible();
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("18 h 59 : aujourd'hui reste réservable, la base est interrogée", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-13T16:59:00Z")); // mardi 13, 18 h 59 à Paris
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([]);
    await openSlotStep(user);

    await user.click(screen.getByRole("radio", { name: formatDayKey("2026-10-13") }));
    expect(screen.queryByText(/Trop tard pour réserver/)).not.toBeInTheDocument();
    await vi.waitFor(() => expect(bookingData.getAvailableSlots).toHaveBeenCalled());
  });
});

describe("BookingPage : rendez-vous à moins de 24 h", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const SOON = {
    ...SLOT,
    startsAt: "2026-10-13T12:00:00.000Z", // 14 h à Paris, dans 2 h
    endsAt: "2026-10-13T13:00:00.000Z",
  };

  it("le récapitulatif et la confirmation préviennent : annulation en ligne impossible", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SOON]);
    vi.mocked(bookingData.createBooking).mockResolvedValue({
      startsAt: SOON.startsAt,
      endsAt: SOON.endsAt,
      serviceName: "Coupe",
      locationLabel: SOON.locationLabel,
      cancelToken: TOKEN,
    });
    renderPage();
    await goToSummary(user);

    // Pas de fausse promesse avant de confirmer.
    expect(screen.getByText(/tu ne pourras pas l'annuler en ligne/)).toBeVisible();
    expect(screen.queryByText(/Tu pourras annuler en ligne/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(
      screen.getByText(/dans moins de 24 h : tu ne pourras pas l'annuler en ligne/),
    ).toBeVisible();
    expect(screen.getByText(/contacte Alix directement/)).toBeVisible();
  });

  it("à plus de 24 h : aucun avertissement, promesse d'annulation conservée", async () => {
    const user = userEvent.setup();
    const LATER = {
      ...SOON,
      startsAt: "2026-10-14T12:00:00.000Z", // dans 26 h
      endsAt: "2026-10-14T13:00:00.000Z",
    };
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([LATER]);
    vi.mocked(bookingData.createBooking).mockResolvedValue({
      startsAt: LATER.startsAt,
      endsAt: LATER.endsAt,
      serviceName: "Coupe",
      locationLabel: LATER.locationLabel,
      cancelToken: TOKEN,
    });
    renderPage();
    await goToSummary(user);
    expect(screen.getByText(/Tu pourras annuler en ligne jusqu'à 24 h avant/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("heading", { name: "C'est réservé !" });
    expect(screen.queryByText(/dans moins de 24 h/)).not.toBeInTheDocument();
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
