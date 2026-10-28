import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GalleryCarousel } from "@/components/GalleryCarousel";
import type { GalleryPhoto } from "@/features/gallery/data";

/**
 * Vue agrandie, ouverte depuis le carrousel. jsdom n'a ni `showModal`, ni API Web Animations,
 * ni mise en page : la fenêtre s'ouvre par l'attribut `open`, sans animation, et la largeur
 * des photos (375 px) ainsi que le défilement de la bande sont simulés.
 */

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

const WIDTH = 375;
const scrollPositions = new WeakMap<Element, number>();

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(WIDTH);
  vi.spyOn(Element.prototype, "scrollLeft", "get").mockImplementation(function (this: Element) {
    return scrollPositions.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, "scrollLeft", "set").mockImplementation(function (
    this: Element,
    value: number,
  ) {
    scrollPositions.set(this, value);
  });
  // Défilement instantané, suivi de l'événement `scroll` que le navigateur enverrait.
  HTMLElement.prototype.scrollTo = vi.fn(function (
    this: Element,
    options?: ScrollToOptions | number,
  ) {
    if (typeof options === "object" && options.left !== undefined) {
      scrollPositions.set(this, options.left);
    }
    this.dispatchEvent(new Event("scroll"));
  }) as unknown as typeof HTMLElement.prototype.scrollTo;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.overflow = "";
});

async function openPhoto(index: number) {
  const user = userEvent.setup();
  render(<GalleryCarousel photos={PHOTOS} />);
  await user.click(screen.getByRole("button", { name: `Agrandir la photo ${index + 1} sur 3` }));
  return { user, dialog: screen.getByRole("dialog", { name: "Galerie, photo agrandie" }) };
}

describe("GalleryLightbox", () => {
  it("toucher une vignette ouvre la photo en grand, en couleur, focus sur « Fermer »", async () => {
    const lengthBefore = window.history.length;
    const { dialog } = await openPhoto(1);

    const photo = within(dialog).getByRole("img", { name: "Barbe taillée" });
    expect(photo).not.toHaveClass("grayscale");
    expect(photo).toHaveAttribute("src", "https://example.test/b?token=2");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Fermer la photo" })).toHaveFocus();
    // Bande calée sur la photo touchée, page derrière bloquée, entrée d'historique ajoutée.
    expect(within(dialog).getByRole("list", { name: "Photos agrandies" }).scrollLeft).toBe(WIDTH);
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it("flèches à l'écran et au clavier : photo voisine, bornée aux extrémités", async () => {
    const { user, dialog } = await openPhoto(0);
    const previous = within(dialog).getByRole("button", { name: "Photo précédente" });
    const next = within(dialog).getByRole("button", { name: "Photo suivante" });
    expect(previous).toBeDisabled();

    await user.click(next);
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(within(dialog).getByText("3 / 3")).toBeInTheDocument();
    expect(next).toBeDisabled();
    await user.keyboard("{ArrowLeft}");
    expect(within(dialog).getByText("2 / 3")).toBeInTheDocument();
  });

  it("« Fermer » : retour en arrière dans l'historique, carrousel calé, focus sur la vignette vue", async () => {
    const { user, dialog } = await openPhoto(0);
    await user.click(within(dialog).getByRole("button", { name: "Photo suivante" }));
    await user.click(within(dialog).getByRole("button", { name: "Fermer la photo" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Agrandir la photo 2 sur 3" })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("Échap ferme la vue", async () => {
    const { user } = await openPhoto(2);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Agrandir la photo 3 sur 3" })).toHaveFocus();
  });

  it("bouton « retour » du téléphone : ferme la vue sans quitter la page", async () => {
    await openPhoto(0);
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("list", { name: /Photos de la galerie/ })).toBeInTheDocument();
  });

  it("toucher le fond ferme, toucher la photo non", async () => {
    const { user, dialog } = await openPhoto(0);
    await user.click(within(dialog).getByRole("img", { name: "Dégradé court" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const slide = within(dialog).getByRole("img", { name: "Dégradé court" }).closest("li")!;
    await user.click(slide);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("une seule photo : ni compteur ni flèches, seulement « Fermer »", async () => {
    const user = userEvent.setup();
    render(<GalleryCarousel photos={PHOTOS.slice(0, 1)} />);
    await user.click(screen.getByRole("button", { name: "Agrandir la photo 1 sur 1" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Fermer la photo"]);
    expect(within(dialog).queryByText("1 / 1")).not.toBeInTheDocument();
  });
});
