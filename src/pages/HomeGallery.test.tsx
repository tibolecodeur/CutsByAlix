import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as booking from "@/features/booking/data";
import * as gallery from "@/features/gallery/data";
import { HomePage } from "@/pages/HomePage";

/** Section « Galerie » de l'accueil, couche données simulée (aucune vraie photo). */
vi.mock("@/features/booking/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/booking/data")>()),
  getServices: vi.fn(),
}));
vi.mock("@/features/gallery/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gallery/data")>()),
  getPublishedGallery: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(booking.getServices).mockReset().mockResolvedValue([]);
  vi.mocked(gallery.getPublishedGallery).mockReset();
});

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
  return screen.getByRole("region", { name: "Galerie" });
}

describe("HomePage : galerie", () => {
  it("affiche les photos publiées : texte alternatif, dimensions, chargement différé", async () => {
    vi.mocked(gallery.getPublishedGallery).mockResolvedValue([
      {
        id: "1",
        url: "https://example.test/a?token=1",
        altText: "Dégradé court",
        width: 1200,
        height: 900,
      },
      {
        id: "2",
        url: "https://example.test/b?token=2",
        altText: "Barbe taillée",
        width: 900,
        height: 1200,
      },
    ]);
    const section = renderHome();

    const photos = await within(section).findAllByRole("img");
    expect(photos.map((p) => p.getAttribute("alt"))).toEqual(["Dégradé court", "Barbe taillée"]);
    expect(photos[0]).toHaveAttribute("loading", "lazy");
    expect(photos[0]).toHaveAttribute("width", "1200");
    expect(photos[0]).toHaveAttribute("height", "900");
    expect(photos[1]).toHaveAttribute("src", "https://example.test/b?token=2");
  });

  it("aucune photo publiée : « Photos bientôt disponibles. », aucune photo figée", async () => {
    vi.mocked(gallery.getPublishedGallery).mockResolvedValue([]);
    const section = renderHome();
    expect(await within(section).findByText("Photos bientôt disponibles.")).toBeInTheDocument();
    expect(within(section).queryByRole("img")).not.toBeInTheDocument();
  });

  it("panne : message discret, le reste de la page s'affiche", async () => {
    vi.mocked(gallery.getPublishedGallery).mockRejectedValue(new Error("gallery_unavailable"));
    const section = renderHome();
    expect(
      await within(section).findByText("Les photos ne sont pas disponibles pour le moment."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "CutsByAlix" })).toBeInTheDocument();
  });
});
