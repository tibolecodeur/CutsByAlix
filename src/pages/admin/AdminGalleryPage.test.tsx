import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/features/admin/data";
import * as gallery from "@/features/admin/gallery";
import type { AdminGalleryItem } from "@/features/admin/gallery";
import * as images from "@/features/gallery/processImage";
import { FEATURED_PHOTOS } from "@/features/gallery/featuredPhotos";
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
  hideGalleryItem: vi.fn(),
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
    imagePath: `${id}.webp`,
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
  vi.mocked(gallery.hideGalleryItem)
    .mockReset()
    .mockResolvedValue({
      imagePath: "neuf.webp",
      imageUrl: "https://example.test/neuf",
      linksRevoked: true,
    });
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

/** Liste des cartes (toutes les photos), distincte de l'aperçu « Sur le site ». */
const allPhotos = () => screen.getByRole("list", { name: "Toutes les photos" });

describe("AdminGalleryPage : liste", () => {
  it("affiche les photos, leur statut et ramasse les fichiers orphelins", async () => {
    renderPage();
    expect(await screen.findByText("3 photos, dont 2 publiées.")).toBeInTheDocument();
    const cards = within(allPhotos()).getAllByRole("listitem");
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

  it("galerie vide : propose l'import de la vitrine et l'ajout, le site n'affiche rien", async () => {
    vi.mocked(gallery.getAdminGallery).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/ajoute ta première photo/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Photos de la vitrine" })).toBeInTheDocument();
    expect(screen.getByText("Aucune photo n'est affichée sur le site.")).toBeInTheDocument();
  });

  it("« Sur le site » : seulement les photos publiées, dans l'ordre du carrousel", async () => {
    renderPage();
    const preview = await screen.findByRole("region", { name: "Sur le site" });
    expect(within(preview).getByText(/2 photos affichées, dans cet ordre/)).toBeInTheDocument();
    expect(
      within(preview)
        .getAllByRole("img")
        .map((img) => img.getAttribute("alt")),
    ).toEqual(["Dégradé court", "Barbe taillée"]);
    // Une galerie non vide ne repropose jamais l'import (supprimer reste définitif).
    expect(screen.queryByRole("region", { name: "Photos de la vitrine" })).not.toBeInTheDocument();
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

    // Le formulaire est amené à l'écran (focus) dès que la photo est prête.
    expect(screen.getByRole("form", { name: "Détails de la photo" })).toHaveFocus();
    const publish = screen.getByRole("button", { name: "Publier" });
    const consent = screen.getByRole("checkbox", {
      name: /La personne photographiée est d'accord/,
    });
    // Sans l'accord : erreur reliée à la case, focus dessus, rien n'est envoyé.
    await user.click(publish);
    expect(consent).toHaveFocus();
    expect(consent).toHaveAccessibleDescription(/Coche l'accord de la personne photographiée/);
    expect(gallery.addGalleryItem).not.toHaveBeenCalled();

    await user.click(consent);
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
    const cards = within(allPhotos()).getAllByRole("listitem");
    expect(within(cards[1]!).getByText("Dégradé court")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descendre la photo 2" })).toHaveFocus();
    expect(screen.getByText("Photo déplacée en position 2 sur 3.")).toBeInTheDocument();
  });

  it("publier une photo masquée redemande l'accord", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Publier la photo 2/ }));
    const consent = screen.getByRole("checkbox", { name: /d'accord/ });
    expect(consent).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "Publier" });
    await user.click(confirm);
    expect(gallery.setGalleryItemPublished).not.toHaveBeenCalled();
    expect(screen.getByText(/Coche l'accord/)).toBeInTheDocument();
    await user.click(consent);
    await user.click(confirm);
    expect(gallery.setGalleryItemPublished).toHaveBeenCalledWith("p2", true, true);
    expect(await screen.findByText("3 photos, dont 3 publiées.")).toBeInTheDocument();
  });

  it("masquer une photo publiée change son fichier : les anciens liens sont coupés", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Masquer la photo 1/ }));
    expect(gallery.hideGalleryItem).toHaveBeenCalledWith(ITEMS[0]);
    expect(await screen.findByText("3 photos, dont 1 publiée.")).toBeInTheDocument();
    expect(
      screen.getByText(/liens vers elle qui auraient été copiés ne fonctionnent plus/),
    ).toBeInTheDocument();
    // Le focus revient sur le même emplacement (devenu « Publier »).
    expect(screen.getByRole("button", { name: "Publier la photo 1" })).toHaveFocus();
    expect(screen.getByRole("img", { name: "Dégradé court" })).toHaveAttribute(
      "src",
      "https://example.test/neuf",
    );
  });

  it("masquage sans changement de fichier (copie ratée) : Alix est prévenue", async () => {
    vi.mocked(gallery.hideGalleryItem).mockResolvedValue({
      imagePath: "p1.webp",
      imageUrl: "https://example.test/p1",
      linksRevoked: false,
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Masquer la photo 1/ }));
    expect(
      await screen.findByText(/des liens copiés avant peuvent encore l'afficher/),
    ).toBeInTheDocument();
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
    // Le nouveau texte vaut pour la carte ET pour l'aperçu « Sur le site ».
    expect(
      await within(allPhotos()).findByRole("img", { name: "Barbe courte" }),
    ).toBeInTheDocument();
  });

  it("supprimer demande une confirmation, « Garder » n'efface rien", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /Supprimer la photo 1/ }));
    // Focus sur l'option sûre, puis retour sur « Supprimer » si on garde la photo.
    expect(screen.getByRole("button", { name: "Garder la photo" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Garder la photo" }));
    expect(gallery.deleteGalleryItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Supprimer la photo 1" })).toHaveFocus();

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
    expect(within(allPhotos()).getAllByRole("listitem")).toHaveLength(3);
  });
});
describe("AdminGalleryPage : ordre rapide", () => {
  it("« En premier » : autant d'échanges qu'il faut, la photo passe en tête", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", {
        name: "Mettre la photo 3 en premier",
      }),
    );

    expect(gallery.moveGalleryItem).toHaveBeenCalledTimes(2);
    expect(gallery.moveGalleryItem).toHaveBeenCalledWith("p3", "up");
    const cards = within(allPhotos()).getAllByRole("listitem");
    expect(within(cards[0]!).getByText("Barbe taillée")).toBeInTheDocument();
    expect(screen.getByText("Photo déplacée en position 1 sur 3.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mettre la photo 1 en premier" })).toBeDisabled();
  });

  it("« En dernier » s'arrête si la base répond « déjà au bout »", async () => {
    vi.mocked(gallery.moveGalleryItem).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole("button", {
        name: "Mettre la photo 1 en dernier",
      }),
    );

    await waitFor(() => expect(gallery.moveGalleryItem).toHaveBeenCalledTimes(2));
    const cards = within(allPhotos()).getAllByRole("listitem");
    expect(within(cards[1]!).getByText("Dégradé court")).toBeInTheDocument();
  });

  it("deux photos seulement : pas de « En premier / En dernier », « Monter » suffit", async () => {
    vi.mocked(gallery.getAdminGallery).mockResolvedValue(ITEMS.slice(0, 2));
    renderPage();
    expect(await screen.findByRole("button", { name: "Monter la photo 2" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /en premier/ })).not.toBeInTheDocument();
  });
});

describe("AdminGalleryPage : import des photos de la vitrine", () => {
  beforeEach(() => {
    vi.mocked(gallery.getAdminGallery).mockResolvedValueOnce([]);
    // Fichiers de /media/galerie/ : quelques octets suffisent, le traitement est simulé.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(new Blob([new Uint8Array(8)], { type: "image/webp" })),
    );
  });

  it("exige l'accord, puis importe les 7 photos dans l'ordre et recharge la liste", async () => {
    const user = userEvent.setup();
    renderPage();
    const block = await screen.findByRole("region", {
      name: "Photos de la vitrine",
    });
    await user.click(within(block).getByRole("button", { name: "Importer les 7 photos" }));
    expect(within(block).getByText(/Coche l'accord des personnes photographiées/)).toBeVisible();
    expect(gallery.addGalleryItem).not.toHaveBeenCalled();

    await user.click(within(block).getByRole("checkbox", { name: /sont d'accord/ }));
    await user.click(within(block).getByRole("button", { name: "Importer les 7 photos" }));

    await waitFor(() => expect(gallery.addGalleryItem).toHaveBeenCalledTimes(7));
    const added = vi.mocked(gallery.addGalleryItem).mock.calls.map(([input]) => input);
    expect(added.every((input) => input.consent && input.image === PROCESSED)).toBe(true);
    expect(added[0]!.altText).toMatch(/^Coupe courte texturée/);
    expect(images.processImage).toHaveBeenCalledTimes(7);
    // Liste rechargée : la galerie n'est plus vide, le bloc d'import disparaît.
    expect(await screen.findByText("3 photos, dont 2 publiées.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Photos de la vitrine" })).not.toBeInTheDocument();
  });

  it("coupure : message, puis « Reprendre l'import » sans renvoyer les photos déjà importées", async () => {
    vi.mocked(gallery.addGalleryItem)
      .mockResolvedValueOnce(ITEMS[0]!)
      .mockResolvedValueOnce(ITEMS[1]!)
      .mockRejectedValueOnce(new AdminError("unknown"));
    const user = userEvent.setup();
    renderPage();
    const block = await screen.findByRole("region", {
      name: "Photos de la vitrine",
    });
    await user.click(within(block).getByRole("checkbox", { name: /sont d'accord/ }));
    await user.click(within(block).getByRole("button", { name: "Importer les 7 photos" }));

    expect(await within(block).findByText(/L'import s'est arrêté \(2 photos sur 7/)).toBeVisible();
    await user.click(within(block).getByRole("button", { name: "Reprendre l'import" }));

    await waitFor(() => expect(gallery.addGalleryItem).toHaveBeenCalledTimes(3 + 5));
    // La reprise commence à la 3e photo : les 2 premières ne sont pas renvoyées.
    const altTexts = vi.mocked(gallery.addGalleryItem).mock.calls.map(([input]) => input.altText);
    expect(altTexts.slice(3)).not.toContain(altTexts[0]);
    expect(altTexts.slice(3)).not.toContain(altTexts[1]);
  });

  it("reprise : une photo créée malgré la coupure (réponse perdue) n'est pas renvoyée", async () => {
    vi.mocked(gallery.addGalleryItem)
      .mockResolvedValueOnce(ITEMS[0]!)
      .mockRejectedValueOnce(new AdminError("unknown"));
    const user = userEvent.setup();
    renderPage();
    const block = await screen.findByRole("region", {
      name: "Photos de la vitrine",
    });
    await user.click(within(block).getByRole("checkbox", { name: /sont d'accord/ }));
    await user.click(within(block).getByRole("button", { name: "Importer les 7 photos" }));
    await within(block).findByText(/L'import s'est arrêté \(1 photo sur 7/);

    // La 2e photo existe en base (réponse perdue) : la galerie relue la contient.
    const firstTwo = FEATURED_PHOTOS.slice(0, 2).map((photo, index) =>
      item(`v${index}`, photo.altText),
    );
    vi.mocked(gallery.getAdminGallery).mockResolvedValueOnce(firstTwo);
    await user.click(within(block).getByRole("button", { name: "Reprendre l'import" }));

    await waitFor(() => expect(gallery.addGalleryItem).toHaveBeenCalledTimes(2 + 5));
    const resumed = vi.mocked(gallery.addGalleryItem).mock.calls.slice(2);
    expect(resumed[0]![0].altText).toBe(FEATURED_PHOTOS[2]!.altText);
  });
});
