import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GalleryCarousel } from "@/components/GalleryCarousel";
import type { GalleryPhoto } from "@/features/gallery/data";

/** Carrousel isolé : il ne reçoit que des photos déjà signées, aucune dépendance Supabase. */

const PHOTOS: GalleryPhoto[] = [
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
  {
    id: "3",
    url: "https://example.test/c?token=3",
    altText: "Coupe aux ciseaux",
    width: 1000,
    height: 1250,
  },
];

const originalScrollBy = HTMLElement.prototype.scrollBy;

afterEach(() => {
  HTMLElement.prototype.scrollBy = originalScrollBy;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GalleryCarousel", () => {
  it("affiche chaque photo en noir et blanc, en chargement différé, dans une bande focalisable", () => {
    render(<GalleryCarousel photos={PHOTOS} />);

    const strip = screen.getByRole("list", { name: /Photos de la galerie/ });
    expect(strip).toHaveAttribute("tabindex", "0");
    const photos = within(strip).getAllByRole("img");
    expect(photos.map((photo) => photo.getAttribute("alt"))).toEqual([
      "Dégradé court",
      "Barbe taillée",
      "Coupe aux ciseaux",
    ]);
    for (const photo of photos) {
      expect(photo).toHaveAttribute("loading", "lazy");
      expect(photo).toHaveClass("grayscale");
    }
    expect(photos[1]).toHaveAttribute("src", "https://example.test/b?token=2");
    expect(photos[1]).toHaveAttribute("width", "900");
    expect(photos[1]).toHaveAttribute("height", "1200");
  });

  it("les boutons font défiler d'une photo dans chaque sens", async () => {
    const user = userEvent.setup();
    // jsdom ne calcule aucune mise en page : scrollBy est espionné, la largeur simulée.
    const scrollBy = vi.fn();
    HTMLElement.prototype.scrollBy = scrollBy;
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(300);
    render(<GalleryCarousel photos={PHOTOS} />);

    // jsdom n'a pas d'IntersectionObserver : les deux boutons restent actifs.
    await user.click(screen.getByRole("button", { name: "Photo suivante" }));
    await user.click(screen.getByRole("button", { name: "Photo précédente" }));

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: 300, behavior: "smooth" });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: -300, behavior: "smooth" });
  });

  it("désactive « Précédente » au début quand le navigateur sait observer la bande", () => {
    const observe = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect = vi.fn();
      },
    );
    render(<GalleryCarousel photos={PHOTOS} />);

    expect(screen.getByRole("button", { name: "Photo précédente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Photo suivante" })).toBeEnabled();
    // Seules la première et la dernière photo sont observées (les deux extrémités).
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it("une seule photo : pas de boutons de défilement", () => {
    render(<GalleryCarousel photos={PHOTOS.slice(0, 1)} />);
    expect(screen.getByRole("img", { name: "Dégradé court" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("aucune photo : état vide avec le lien Instagram, aucune image", () => {
    render(<GalleryCarousel photos={[]} />);

    const empty = screen.getByRole("status");
    expect(within(empty).getByText("Photos bientôt disponibles.")).toBeInTheDocument();
    const instagram = within(empty).getByRole("link", { name: /Voir les coupes sur Instagram/ });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
