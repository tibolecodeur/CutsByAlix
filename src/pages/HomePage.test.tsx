import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as booking from "@/features/booking/data";
import * as gallery from "@/features/gallery/data";
import { LOCATION_NOTICE } from "@/lib/contact";
import { HomePage } from "@/pages/HomePage";

/** Accueil : grille tarifaire, lieu et paiement (consigne 27). Couche données simulée. */
vi.mock("@/features/booking/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/booking/data")>()),
  getServices: vi.fn(),
}));
vi.mock("@/features/gallery/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gallery/data")>()),
  getPublishedGallery: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(booking.getServices)
    .mockReset()
    .mockResolvedValue([
      { id: "s1", name: "Coupe", durationMin: 60, priceLabel: "10 €" },
      { id: "s2", name: "Coupe + barbe", durationMin: 70, priceLabel: null },
    ]);
  vi.mocked(gallery.getPublishedGallery).mockReset().mockResolvedValue([]);
});

/**
 * Cherche l'élément dont le texte COMPLET (enfants compris) vaut `text` : « Prix : » est dans
 * un <span> masqué à l'œil, que la recherche par défaut (texte propre à l'élément) ignore.
 * Seul l'élément le plus profond est retenu, pas tous ses parents.
 */
function fullText(text: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === text &&
    Array.from(element.children).every((child) => child.textContent !== text);
}

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  it("accroche définitive : plus de texte provisoire", () => {
    renderHome();
    const hero = screen.getByRole("region", { name: "CutsByAlix" });
    expect(within(hero).getByText(/Réserve ta coupe en une minute\./)).toBeInTheDocument();
    expect(screen.queryByText(/provisoire/i)).not.toBeInTheDocument();
  });

  it("grille tarifaire : nom, prix et durée annoncés aux lecteurs d'écran", async () => {
    renderHome();
    const prestations = screen.getByRole("region", { name: "Prestations" });

    expect(await within(prestations).findByText(fullText("Prix : 10 €"))).toBeInTheDocument();
    expect(within(prestations).getByText(fullText("Prix : À confirmer"))).toBeInTheDocument();
    expect(within(prestations).getByText(fullText("Durée : 60 min"))).toBeInTheDocument();
    expect(within(prestations).getByText(fullText("Durée : 70 min"))).toBeInTheDocument();
    expect(within(prestations).getByText("Paiement en liquide ou par virement.")).toBeVisible();
  });

  it("« Comment réserver » : lieu exact sur Instagram, plus de « au moment de la réservation »", () => {
    renderHome();
    const reserver = screen.getByRole("region", { name: "Comment réserver" });

    expect(within(reserver).getByText(LOCATION_NOTICE)).toBeVisible();
    expect(
      within(reserver).getByRole("link", { name: /@CutsByAlix sur Instagram/ }),
    ).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(screen.queryByText(/au moment de la réservation/)).not.toBeInTheDocument();
  });
});
