import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate, type InitialEntry } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as bookingData from "@/features/booking/data";
import { calendarDays } from "@/features/booking/availability";
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
    getAvailableDays: vi.fn(),
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

/**
 * Nom d'un jour du calendrier, quel que soit le nombre de créneaux annoncé après la virgule
 * (« mardi 13 octobre, 2 créneaux disponibles »). Testing Library compare le nom en entier.
 */
function dayName(day: string): RegExp {
  return new RegExp(`^${formatDayKey(day)}(,|$)`);
}

/** Case du calendrier du premier jour réservable (au-delà du délai de 2 h). */
async function firstBookableDayRadio() {
  // Le calendrier s'affiche une fois les jours disponibles chargés : on l'attend.
  return screen.findByRole("radio", { name: dayName(firstBookableDay(new Date())) });
}

/**
 * Jours que la base renverrait par défaut : tous ceux qui ne sont pas trop proches (à moins de
 * 2 h), avec 2 créneaux chacun. Calculé À L'APPEL, avec l'horloge du moment (figée par certains
 * tests).
 */
function defaultDays(): bookingData.AvailableDay[] {
  const first = firstBookableDay(new Date());
  return calendarDays(new Date())
    .filter((day) => day >= first)
    .map((day) => ({ day, slotCount: 2 }));
}

beforeEach(() => {
  vi.mocked(bookingData.getServices).mockReset();
  vi.mocked(bookingData.getAvailableDays).mockReset();
  vi.mocked(bookingData.getAvailableDays).mockImplementation(async () => defaultDays());
  vi.mocked(bookingData.getAvailableSlots).mockReset();
  vi.mocked(bookingData.createBooking).mockReset();
});

/** Prestation → jour → créneau → coordonnées → récapitulatif. */
async function goToSummary(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
  await user.click(screen.getByRole("button", { name: "Continuer" }));
  await user.click(await firstBookableDayRadio());
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
    await user.click(await firstBookableDayRadio());

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

describe("BookingPage : délai de 2 h", () => {
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

  it("22 h 01 : la règle est expliquée et aujourd'hui est grisé, non cliquable", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-13T20:01:00Z")); // mardi 13, 22 h 01 à Paris
    await openSlotStep(user);
    expect(screen.getByText(/On réserve au plus tard 2 h avant le rendez-vous/)).toBeVisible();

    const today = await screen.findByRole("radio", { name: dayName("2026-10-13") });
    expect(today).toBeDisabled();
    expect(today).toHaveAccessibleName(`${formatDayKey("2026-10-13")}, aucun créneau disponible`);
    await user.click(today);
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: dayName("2026-10-14") })).toBeEnabled();
  });

  it("22 h 01, jours impossibles à charger : explique « Trop tard » sans interroger la base", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-13T20:01:00Z")); // mardi 13, 22 h 01 à Paris
    vi.mocked(bookingData.getAvailableDays).mockRejectedValue(new Error("réseau"));
    await openSlotStep(user);

    await user.click(await screen.findByRole("radio", { name: dayName("2026-10-13") }));
    expect(
      screen.getByText(`Trop tard pour réserver le ${formatDayKey("2026-10-13")}.`),
    ).toBeVisible();
    expect(
      screen.getByText(new RegExp(`Choisis un jour à partir du ${formatDayKey("2026-10-14")}`)),
    ).toBeVisible();
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("21 h 59 : aujourd'hui reste réservable, la base est interrogée", async () => {
    const user = userEvent.setup();
    vi.setSystemTime(new Date("2026-10-13T19:59:00Z")); // mardi 13, 21 h 59 à Paris
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([]);
    await openSlotStep(user);

    await user.click(screen.getByRole("radio", { name: dayName("2026-10-13") }));
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
    expect(screen.getByText(/contacte Alix directement sur Instagram/)).toBeVisible();
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

    // Récapitulatif : l'adresse sera donnée sur Instagram, sans lien qui ferait quitter le parcours.
    expect(
      screen.getByText(/L'adresse exacte n'est pas affichée sur le site : une fois réservé/),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /Instagram/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(screen.getByText("mardi 15 janvier")).toBeVisible();
    expect(screen.getByText("14:00 – 15:00")).toBeVisible();
    expect(screen.getByText("Saint-Christophe-du-Bois")).toBeVisible();
    expect(screen.getByText(/Tu ne recevras pas d'e-mail de confirmation/)).toBeVisible();
    expect(screen.getByText(new RegExp(`/annuler#${TOKEN}`))).toBeVisible();
    expect(screen.queryByText("Adresse")).not.toBeInTheDocument();

    // Adresse : message et lien Instagram (nouvel onglet, sans opener ni referrer).
    expect(
      screen.getByText(/écris à Alix en message privé sur Instagram pour la recevoir/),
    ).toBeVisible();
    // Le lien d'annulation vient avant l'adresse, et ne doit pas être envoyé à Alix.
    expect(screen.getByText(/n'envoie pas ton lien d'annulation/)).toBeVisible();
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles.indexOf("Ton lien d'annulation")).toBeLessThan(titles.indexOf("L'adresse"));
    const instagram = screen.getByRole("link", { name: /@CutsByAlix sur Instagram/ });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(instagram.getAttribute("rel")?.split(" ")).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );

    // Le jeton n'apparaît dans aucun lien, sauf celui de la page d'annulation.
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.filter((href) => href.includes(TOKEN))).toEqual([`/annuler#${TOKEN}`]);
  });
});

// ---------------------------------------------------------------------------------------------
// Consigne 25 : clé d'idempotence (C-05), historique par étape (C-04), confirmation gardée le
// temps de l'onglet (C-03).
// ---------------------------------------------------------------------------------------------

/** Boutons Retour / Suivant « du navigateur » : le MemoryRouter n'a pas de barre d'adresse. */
function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => void navigate(-1)}>
        Retour du navigateur
      </button>
      <button type="button" onClick={() => void navigate(1)}>
        Suivant du navigateur
      </button>
    </>
  );
}

function renderWithHistory(initialEntries: InitialEntry[] = ["/", "/reserver"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <HistoryButtons />
      <Routes>
        <Route path="/" element={<p>Accueil</p>} />
        <Route path="/reserver" element={<BookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const RECEIPT = {
  startsAt: SLOT.startsAt,
  endsAt: SLOT.endsAt,
  serviceName: "Coupe",
  locationLabel: "Saint-Christophe-du-Bois",
  cancelToken: TOKEN,
};
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function requestKeys() {
  return vi.mocked(bookingData.createBooking).mock.calls.map(([, key]) => key);
}

describe("BookingPage : clé d'idempotence (C-05)", () => {
  beforeEach(() => sessionStorage.clear());

  it("même clé pour un nouvel essai après une coupure : le rejeu récupère la réservation", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking)
      .mockRejectedValueOnce(new bookingData.BookingError("unknown"))
      .mockResolvedValueOnce(RECEIPT);
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Vérifie ta connexion/);
    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();

    const keys = requestKeys();
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(UUID_SHAPE);
    expect(keys[1]).toBe(keys[0]);
  });

  it("nouvelle clé si les coordonnées changent entre deux essais", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockRejectedValue(new bookingData.BookingError("unknown"));
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retour" }));
    await user.type(await screen.findByLabelText("Prénom"), "e");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("alert");

    const keys = requestKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toMatch(UUID_SHAPE);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("retaper les mêmes coordonnées (même mise en forme près) garde la clé : le rejeu reste possible", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockRejectedValue(new bookingData.BookingError("unknown"));
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retour" }));
    // Efface puis retape le prénom, ajoute un espace au bord du téléphone : même réservation.
    const firstName = await screen.findByLabelText("Prénom");
    await user.clear(firstName);
    await user.type(firstName, "Zoé");
    await user.type(screen.getByLabelText("Téléphone"), " ");
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(await screen.findByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("alert");

    const keys = requestKeys();
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("request_conflict : message sobre, puis une nouvelle clé au prochain essai", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking)
      .mockRejectedValueOnce(new bookingData.BookingError("request_conflict"))
      .mockResolvedValueOnce(RECEIPT);
    renderPage();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La réservation n'a pas pu être confirmée. Réessaie dans un instant.",
    );
    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("heading", { name: "C'est réservé !" });

    const keys = requestKeys();
    expect(keys[1]).toMatch(UUID_SHAPE);
    expect(keys[1]).not.toBe(keys[0]);
  });
});

describe("BookingPage : bouton Retour du navigateur (C-04)", () => {
  beforeEach(() => sessionStorage.clear());

  it("revient d'une étape à la fois, sans perdre la saisie, puis Suivant y retourne", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    renderWithHistory();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    expect(await screen.findByRole("heading", { name: "Tes coordonnées" })).toHaveFocus();
    expect(screen.getByLabelText("Prénom")).toHaveValue("Zoé");
    expect(screen.getByLabelText("Téléphone")).toHaveValue("0639980010");

    await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    expect(await screen.findByRole("radio", { name: /14:00 – 15:00/ })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    expect(await screen.findByRole("radio", { name: /Coupe/ })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Suivant du navigateur" }));
    await user.click(screen.getByRole("button", { name: "Suivant du navigateur" }));
    await user.click(screen.getByRole("button", { name: "Suivant du navigateur" }));
    expect(await screen.findByRole("heading", { name: "Vérifie et confirme" })).toBeVisible();

    // Depuis l'étape 1, le Retour quitte la page, comme attendu.
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    }
    expect(await screen.findByText("Accueil")).toBeVisible();
  });

  it("revenir à la toute première entrée déplace le focus sur le titre de l'étape 1", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    // /reserver est la PREMIÈRE entrée (clé « default », celle de l'arrivée sur la page) : y
    // revenir ne doit pas être pris pour « le client n'a jamais navigué ».
    renderWithHistory(["/reserver"]);
    await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await screen.findByRole("heading", { name: "Quel jour, quelle heure ?" });

    await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    expect(await screen.findByRole("heading", { name: "Quelle prestation ?" })).toHaveFocus();
  });

  it("le bouton « Retour » du site recule aussi dans l'historique (les deux restent alignés)", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    renderWithHistory();
    await goToSummary(user);

    await user.click(screen.getByRole("button", { name: "Retour" }));
    await screen.findByRole("heading", { name: "Tes coordonnées" });
    // Retour du site puis Suivant du navigateur : on retrouve le récapitulatif.
    await user.click(screen.getByRole("button", { name: "Suivant du navigateur" }));
    expect(await screen.findByRole("heading", { name: "Vérifie et confirme" })).toBeVisible();
  });

  it("après la réservation, le Retour ne rouvre pas le formulaire (pas de double réservation)", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockResolvedValue(RECEIPT);
    renderWithHistory();
    await goToSummary(user);
    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("heading", { name: "C'est réservé !" });

    await user.click(screen.getByRole("button", { name: "Retour du navigateur" }));
    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirmer la réservation" })).toBeNull();
  });
});

describe("BookingPage : rechargement de la confirmation (C-03)", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("garde le récapitulatif dans l'onglet, sans aucune donnée personnelle", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockResolvedValue(RECEIPT);
    renderWithHistory();
    await goToSummary(user);
    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));
    await screen.findByRole("heading", { name: "C'est réservé !" });

    const stored = sessionStorage.getItem("cutsbyalix:booking-receipt");
    expect(JSON.parse(stored!)).toEqual(RECEIPT);
    expect(stored).not.toMatch(/Zoé|Durand|0639980010|@/);
  });

  it("rechargement d'une entrée du parcours : la confirmation et son lien reviennent", () => {
    sessionStorage.setItem("cutsbyalix:booking-receipt", JSON.stringify(RECEIPT));
    renderWithHistory(["/", { pathname: "/reserver", state: { bookingStep: "done" } }]);

    expect(screen.getByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(screen.getByText(new RegExp(`/annuler#${TOKEN}`))).toBeVisible();
    expect(bookingData.getServices).not.toHaveBeenCalled();
  });

  it("arrivée à neuf sur /reserver : l'ancienne réservation est oubliée, on repart de zéro", async () => {
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    sessionStorage.setItem("cutsbyalix:booking-receipt", JSON.stringify(RECEIPT));
    renderWithHistory();

    expect(await screen.findByText("Étape 1 sur 4")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "C'est réservé !" })).toBeNull();
    expect(sessionStorage.getItem("cutsbyalix:booking-receipt")).toBeNull();
  });

  it("rechargement en plein formulaire : étape 1, la saisie n'a jamais été stockée", async () => {
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    renderWithHistory(["/", { pathname: "/reserver", state: { bookingStep: "summary" } }]);

    expect(await screen.findByText("Étape 1 sur 4")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sans sessionStorage (navigation privée stricte) : la réservation marche quand même", async () => {
    for (const method of ["setItem", "getItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Stockage refusé", "SecurityError");
      });
    }
    const user = userEvent.setup();
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    vi.mocked(bookingData.createBooking).mockResolvedValue(RECEIPT);
    renderWithHistory();
    await goToSummary(user);
    await user.click(screen.getByRole("button", { name: "Confirmer la réservation" }));

    expect(await screen.findByRole("heading", { name: "C'est réservé !" })).toBeVisible();
    expect(screen.getByText(new RegExp(`/annuler#${TOKEN}`))).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// Consigne 25 bis : jours sans créneau en gris (ADR 0010).
// ---------------------------------------------------------------------------------------------
describe("BookingPage : jours disponibles", () => {
  async function openSlotStep(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(bookingData.getServices).mockResolvedValue([SERVICE]);
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Coupe/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
  }
  const dayAt = (offset: number) => calendarDays(new Date())[offset]!;

  it("grise les jours sans créneau et annonce le nombre de créneaux des autres", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getAvailableDays).mockResolvedValue([
      { day: dayAt(2), slotCount: 1 },
      { day: dayAt(3), slotCount: 3 },
    ]);
    await openSlotStep(user);

    const one = await screen.findByRole("radio", { name: dayName(dayAt(2)) });
    expect(one).toBeEnabled();
    expect(one).toHaveAccessibleName(`${formatDayKey(dayAt(2))}, 1 créneau disponible`);
    expect(screen.getByRole("radio", { name: dayName(dayAt(3)) })).toHaveAccessibleName(
      `${formatDayKey(dayAt(3))}, 3 créneaux disponibles`,
    );
    for (const offset of [0, 1, 4, 27]) {
      const off = screen.getByRole("radio", { name: dayName(dayAt(offset)) });
      expect(off).toBeDisabled();
      expect(off).toHaveAccessibleName(`${formatDayKey(dayAt(offset))}, aucun créneau disponible`);
    }
    // Le gris n'est pas le seul signal : jour barré.
    expect(screen.getByRole("radio", { name: dayName(dayAt(4)) }).closest("label")).toHaveClass(
      "line-through",
    );
    expect(one.closest("label")).not.toHaveClass("line-through");
  });

  it("charge les jours en UNE requête, pour la prestation choisie", async () => {
    const user = userEvent.setup();
    await openSlotStep(user);
    await screen.findByRole("radio", { name: dayName(dayAt(27)) });
    expect(bookingData.getAvailableDays).toHaveBeenCalledTimes(1);
    expect(bookingData.getAvailableDays).toHaveBeenCalledWith(SERVICE.id);
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("un jour grisé ne se choisit pas ; un jour disponible charge ses créneaux", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getAvailableDays).mockResolvedValue([{ day: dayAt(2), slotCount: 1 }]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValue([SLOT]);
    await openSlotStep(user);

    await user.click(await screen.findByRole("radio", { name: dayName(dayAt(1)) }));
    expect(bookingData.getAvailableSlots).not.toHaveBeenCalled();
    expect(screen.getByText("Choisis un jour pour voir les créneaux libres.")).toBeVisible();

    await user.click(screen.getByRole("radio", { name: dayName(dayAt(2)) }));
    expect(await screen.findByRole("radio", { name: /14:00 – 15:00/ })).toBeVisible();
    expect(bookingData.getAvailableSlots).toHaveBeenCalledWith(SERVICE.id, dayAt(2));
  });

  it("aucun jour disponible : message clair avec le lien Instagram, sans « Continuer »", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getAvailableDays).mockResolvedValue([]);
    await openSlotStep(user);

    expect(
      await screen.findByText(
        "Aucun créneau disponible pour le moment, contacte Alix sur Instagram.",
      ),
    ).toBeVisible();
    const link = screen.getByRole("link", { name: /@CutsByAlix sur Instagram/ });
    expect(link).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("radio", { name: dayName(dayAt(2)) })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuer" })).not.toBeInTheDocument();
    // On peut toujours revenir en arrière.
    await user.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByRole("radio", { name: /Coupe/ })).toBeVisible();
  });

  it("jours impossibles à charger : message, calendrier utilisable, « Réessayer » applique le grisé", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getAvailableDays)
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce([{ day: dayAt(2), slotCount: 2 }]);
    await openSlotStep(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Impossible de vérifier les jours disponibles/,
    );
    // Tous les jours restent cliquables, sans rien annoncer de faux sur leur disponibilité.
    const tomorrow = screen.getByRole("radio", { name: dayName(dayAt(1)) });
    expect(tomorrow).toBeEnabled();
    expect(tomorrow).toHaveAccessibleName(formatDayKey(dayAt(1)));

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    // Après « Réessayer », seul le jour +2 a des créneaux : les autres sont grisés.
    const twoSlots = await screen.findByRole("radio", { name: dayName(dayAt(2)) });
    expect(twoSlots).toBeEnabled();
    expect(twoSlots).toHaveAccessibleName(`${formatDayKey(dayAt(2))}, 2 créneaux disponibles`);
    expect(screen.getByRole("radio", { name: dayName(dayAt(1)) })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("le jour déjà choisi qui perd son dernier créneau reste sélectionné et visible, sans bloquer", async () => {
    const user = userEvent.setup();
    // 1er affichage : deux jours disponibles. Au retour de l'étape suivante : le jour choisi a
    // perdu son dernier créneau (un autre client l'a pris).
    vi.mocked(bookingData.getAvailableDays)
      .mockResolvedValueOnce([
        { day: dayAt(2), slotCount: 1 },
        { day: dayAt(3), slotCount: 1 },
      ])
      .mockResolvedValue([{ day: dayAt(3), slotCount: 1 }]);
    vi.mocked(bookingData.getAvailableSlots).mockResolvedValueOnce([SLOT]).mockResolvedValue([]);
    await openSlotStep(user);

    await user.click(await screen.findByRole("radio", { name: dayName(dayAt(2)) }));
    await user.click(await screen.findByRole("radio", { name: /14:00 – 15:00/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    await user.click(await screen.findByRole("button", { name: "Retour" }));

    const chosen = await screen.findByRole("radio", { name: dayName(dayAt(2)) });
    // Ni désactivé (sélection visible, clavier cohérent) ni présenté comme disponible.
    expect(chosen).toBeChecked();
    expect(chosen).toBeEnabled();
    expect(chosen).toHaveAccessibleName(`${formatDayKey(dayAt(2))}, aucun créneau disponible`);
    expect(chosen.closest("label")).toHaveClass("line-through", "has-checked:bg-ink");
    expect(await screen.findByText(/Aucun créneau libre le/)).toBeVisible();
    // Les autres jours sans créneau restent désactivés, l'autre jour disponible reste choisissable.
    expect(screen.getByRole("radio", { name: dayName(dayAt(4)) })).toBeDisabled();
    expect(screen.getByRole("radio", { name: dayName(dayAt(3)) })).toBeEnabled();
  });

  it("pendant le chargement, le calendrier n'est pas affiché à moitié", async () => {
    const user = userEvent.setup();
    vi.mocked(bookingData.getAvailableDays).mockReturnValue(new Promise(() => {}));
    await openSlotStep(user);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Chargement des jours disponibles…",
    );
    expect(screen.queryByRole("radio", { name: dayName(dayAt(2)) })).not.toBeInTheDocument();
  });
});
