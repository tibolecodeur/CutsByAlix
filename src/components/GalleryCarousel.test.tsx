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

const originalScrollTo = HTMLElement.prototype.scrollTo;

afterEach(() => {
  HTMLElement.prototype.scrollTo = originalScrollTo;
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

  it("les boutons amènent la photo voisine au bord de la bande", async () => {
    const user = userEvent.setup();
    // jsdom ne calcule aucune mise en page : scrollTo est espionné, la position simulée.
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(320);
    render(<GalleryCarousel photos={PHOTOS} />);

    // jsdom n'a pas d'IntersectionObserver : les deux boutons restent actifs.
    await user.click(screen.getByRole("button", { name: "Photo suivante" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 320, behavior: "smooth" });
  });

  it("pagination : une pastille par photo, la première en cours, chacune cliquable", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
    render(<GalleryCarousel photos={PHOTOS} />);

    const dots = screen.getAllByRole("button", { name: /^Photo \d sur 3$/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");
    expect(dots[1]).not.toHaveAttribute("aria-current");
    await user.click(dots[2]!);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("plus de 10 photos : un compteur à la place des pastilles", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...PHOTOS[0]!, id: String(index) }));
    render(<GalleryCarousel photos={many} />);
    expect(screen.queryByRole("button", { name: /^Photo \d+ sur 12$/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 / 12")).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Photo précédente" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Photo suivante" })).not.toHaveAttribute(
      "aria-disabled",
    );
    // Chaque photo est observée : la pagination suit la plus visible.
    expect(observe).toHaveBeenCalledTimes(3);
  });

  it("une seule photo : ni flèches ni pastilles, seulement le bouton pour l'agrandir", () => {
    render(<GalleryCarousel photos={PHOTOS.slice(0, 1)} />);
    expect(screen.getByRole("img", { name: "Dégradé court" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Agrandir la photo 1 sur 1"]);
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
