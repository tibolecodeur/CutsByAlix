import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/features/admin/data";
import * as gallery from "@/features/admin/gallery";
import type { AdminGalleryItem } from "@/features/admin/gallery";
import * as images from "@/features/gallery/processImage";
import { ImageError, type ProcessedImage } from "@/features/gallery/processImage";
import { AdminGalleryPage } from "@/pages/admin/AdminGalleryPage";

/**
 * Écran « Galerie » de l'admin, couche données et traitement d'image simulés. Aucune vraie
 * photo : les fichiers ne contiennent que quelques octets.
 */
vi.mock("@/features/admin/gallery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/gallery")>()),
  getAdminGallery: vi.fn(),
  addGalleryItem: vi.fn(),
  setGalleryItemPublished: vi.fn(),
  updateGalleryItemAltText: vi.fn(),
  moveGalleryItem: vi.fn(),
  deleteGalleryItem: vi.fn(),
  sweepGalleryOrphans: vi.fn(),
}));
vi.mock("@/features/gallery/processImage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gallery/processImage")>()),
  processImage: vi.fn(),
}));

function item(id: string, altText: string, fields: Partial<AdminGalleryItem> = {}) {
  return {
    id,
    imageUrl: `https://example.test/${id}`,
    altText,
    width: 1200,
    height: 900,
    sortOrder: 1,
    published: true,
    consentAt: "2026-10-11T10:00:00Z",
    createdAt: "2026-10-11T10:00:00Z",
    ...fields,
  } satisfies AdminGalleryItem;
}

const ITEMS = [
  item("p1", "Dégradé court"),
  item("p2", "Contours nets", { published: false, consentAt: null }),
  item("p3", "Barbe taillée"),
];

const PROCESSED: ProcessedImage = {
  blob: new Blob([new Uint8Array(8)], { type: "image/webp" }),
  type: "image/webp",
  extension: "webp",
  width: 1200,
  height: 900,
};

beforeEach(() => {
  vi.mocked(gallery.getAdminGallery).mockReset().mockResolvedValue(ITEMS);
  vi.mocked(gallery.addGalleryItem).mockReset().mockResolvedValue(ITEMS[0]!);
  vi.mocked(gallery.setGalleryItemPublished).mockReset().mockResolvedValue();
  vi.mocked(gallery.updateGalleryItemAltText).mockReset().mockResolvedValue();
  vi.mocked(gallery.moveGalleryItem).mockReset().mockResolvedValue(true);
  vi.mocked(gallery.deleteGalleryItem).mockReset().mockResolvedValue();
  vi.mocked(gallery.sweepGalleryOrphans).mockReset().mockResolvedValue(0);
  vi.mocked(images.processImage).mockReset().mockResolvedValue(PROCESSED);
  // jsdom n'implémente pas les URL blob: : on les simule.
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:apercu");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminGalleryPage />
    </MemoryRouter>,
  );
}

const photoFile = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_0001.jpg", { type: "image/jpeg" });

async function choosePhoto(user: ReturnType<typeof userEvent.setup>) {
  // Le bouton « Choisir dans la galerie » ouvre ce champ (invisible) ; on y dépose le fichier.
  await user.upload(document.getElementById("photo-library") as HTMLInputElement, photoFile());
  return screen.findByRole("img", { name: "Aperçu de la photo choisie" });
}

describe("AdminGalleryPage : liste", () => {
  it("affiche les photos, leur statut et ramasse les fichiers orphelins", async () => {
    renderPage();
    expect(await screen.findByText("3 photos, dont 2 publiées.")).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(within(cards[1]!).getByText("Masquée")).toBeInTheDocument();
    const thumb = within(cards[0]!).getByRole("img", { name: "Dégradé court" });
    expect(thumb).toHaveAttribute("loading", "lazy");
    expect(thumb).toHaveAttribute("width", "1200");
    expect(gallery.sweepGalleryOrphans).toHaveBeenCalled();
    // Extrémités : on ne monte pas la première, on ne descend pas la dernière.
    expect(screen.getByRole("button", { name: /Monter la photo 1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Descendre la photo 3/ })).toBeDisabled();
  });

  it("galerie vide : invite à ajouter une photo", async () => {
    vi.mocked(gallery.getAdminGallery).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Ajoute ta première photo/)).toBeInTheDocument();
  });

  it("erreur de chargement : message et « Réessayer »", async () => {
    vi.mocked(gallery.getAdminGallery).mockRejectedValueOnce(new AdminError("unknown"));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Impossible de charger les photos.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("3 photos, dont 2 publiées.")).toBeInTheDocument();
  });
});

describe("AdminGalleryPage : ajout", () => {
  it("publie une photo seulement avec le texte alternatif ET l'accord", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("3 photos, dont 2 publiées.");
    await choosePhoto(user);

    const publish = screen.getByRole("button", { name: "Publier" });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(/Coche la case pour pouvoir publier/);

    await user.click(
      screen.getByRole("checkbox", { name: /La personne photographiée est d'accord/ }),
    );
    expect(publish).toBeEnabled();
    // Texte alternatif vide : refus, focus sur le champ.
    await user.click(publish);
    expect(screen.getByText(/Décris la photo en quelques mots/)).toBeInTheDocument();
    expect(screen.getByLabelText("Texte alternatif (obligatoire)")).toHaveFocus();
    expect(gallery.addGalleryItem).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Texte alternatif (obligatoire)"), "Dégradé bas");
    await user.click(publish);

    expect(gallery.addGalleryItem).toHaveBeenCalledWith({
      image: PROCESSED,
      altText: "Dégradé bas",
      consent: true,
    });
    expect(await screen.findByText("Photo publiée dans la galerie.")).toBeInTheDocument();
    // La liste est relue (la nouvelle photo y apparaît).
    await waitFor(() => expect(gallery.getAdminGallery).toHaveBeenCalledTimes(2));
    // L'aperçu (URL blob:) est libéré.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:apercu");
  });

  it("« Enregistrer sans publier » n'envoie jamais l'accord", async () => {
    const user = userEvent.setup();
    renderPage();
    await choosePhoto(user);
    await user.click(screen.getByRole("checkbox", { name: /d'accord/ }));
    await user.type(screen.getByLabelText("Texte alternatif (obligatoire)"), "Brouillon");
    await user.click(screen.getByRole("button", { name: "Enregistrer sans publier" }));
    expect(gallery.addGalleryItem).toHaveBeenCalledWith(
      expect.objectContaining({ altText: "Brouillon", consent: false }),
    );
    expect(await screen.findByText("Photo enregistrée, masquée du site.")).toBeInTheDocument();
  });

  it("fichier refusé (SVG, faux JPEG…) : message clair, rien n'est envoyé", async () => {
    vi.mocked(images.processImage).mockRejectedValue(new ImageError("invalid_file"));
    const user = userEvent.setup();
    renderPage();
    await user.upload(document.getElementById("photo-camera") as HTMLInputElement, photoFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(/pas une photo JPEG, PNG ou WebP/);
    expect(
      screen.queryByRole("img", { name: "Aperçu de la photo choisie" }),
    ).not.toBeInTheDocument();
    expect(gallery.addGalleryItem).not.toHaveBeenCalled();
  });

  it("galerie pleine : message de la limite, le formulaire reste rempli", async () => {
    vi.mocked(gallery.addGalleryItem).mockRejectedValue(new AdminError("gallery_limit_reached"));
    const user = userEvent.setup();
    renderPage();
    await choosePhoto(user);
    await user.type(screen.getByLabelText("Texte alternatif (obligatoire)"), "Coupe");
    await user.click(screen.getByRole("button", { name: "Enregistrer sans publier" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/La galerie est pleine/);
    expect(screen.getByLabelText("Texte alternatif (obligatoire)")).toHaveValue("Coupe");
  });
});

describe("AdminGalleryPage : actions sur une photo", () => {
  it("descendre : la liste change d'ordre et le focus reste sur le bouton", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Descendre la photo 1/ }));

    expect(gallery.moveGalleryItem).toHaveBeenCalledWith("p1", "down");
    const cards = await screen.findAllByRole("listitem");
    expect(within(cards[1]!).getByText("Dégradé court")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Descendre la photo 2 « Dégradé court »/ }),
    ).toHaveFocus();
    expect(screen.getByText("Photo déplacée en position 2 sur 3.")).toBeInTheDocument();
  });

  it("publier une photo masquée redemande l'accord", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Publier la photo 2/ }));
    const confirm = screen.getByRole("button", { name: "Publier" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /d'accord/ }));
    await user.click(confirm);
    expect(gallery.setGalleryItemPublished).toHaveBeenCalledWith("p2", true, true);
    expect(await screen.findByText("3 photos, dont 3 publiées.")).toBeInTheDocument();
  });

  it("masquer une photo publiée", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Masquer la photo 1/ }));
    expect(gallery.setGalleryItemPublished).toHaveBeenCalledWith("p1", false, false);
    expect(await screen.findByText("3 photos, dont 1 publiée.")).toBeInTheDocument();
  });

  it("modifier le texte alternatif", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: /Modifier le texte de la photo 3/ }),
    );
    const field = screen.getByLabelText("Texte alternatif");
    await user.clear(field);
    await user.type(field, "Barbe courte");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(gallery.updateGalleryItemAltText).toHaveBeenCalledWith("p3", "Barbe courte");
    expect(await screen.findByRole("img", { name: "Barbe courte" })).toBeInTheDocument();
  });

  it("supprimer demande une confirmation, « Garder » n'efface rien", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer la photo 1/ }));
    await user.click(screen.getByRole("button", { name: "Garder la photo" }));
    expect(gallery.deleteGalleryItem).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Supprimer la photo 1/ }));
    await user.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    expect(gallery.deleteGalleryItem).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("2 photos, dont 1 publiée.")).toHaveFocus();
  });

  it("erreur sur une action : message dans la carte, la photo reste", async () => {
    vi.mocked(gallery.deleteGalleryItem).mockRejectedValue(new AdminError("not_found"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer la photo 1/ }));
    await user.click(screen.getByRole("button", { name: "Oui, supprimer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette photo n'existe plus.");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
