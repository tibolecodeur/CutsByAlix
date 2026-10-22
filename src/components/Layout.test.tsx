import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";
import { Layout } from "@/components/Layout";

// jsdom ne fait pas défiler la page : on neutralise les appels de useScrollToHash.
beforeAll(() => {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<h1>Accueil</h1>} />
          <Route path="reserver" element={<h1>Réserver</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout : menu mobile", () => {
  it("s'ouvre et se referme avec le bouton Menu (aria-expanded)", async () => {
    const user = userEvent.setup();
    renderAt("/reserver");
    const bouton = screen.getByRole("button", { name: "Menu" });

    expect(bouton).toHaveAttribute("aria-expanded", "false");
    expect(bouton).toHaveAttribute("aria-controls", "menu-principal");

    await user.click(bouton);
    expect(bouton).toHaveAttribute("aria-expanded", "true");

    await user.click(bouton);
    expect(bouton).toHaveAttribute("aria-expanded", "false");
  });

  it("se referme avec Échap et rend le focus au bouton", async () => {
    const user = userEvent.setup();
    renderAt("/reserver");
    const bouton = screen.getByRole("button", { name: "Menu" });

    await user.click(bouton);
    await user.tab();
    expect(screen.getByRole("link", { name: "Prestations" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(bouton).toHaveAttribute("aria-expanded", "false");
    expect(bouton).toHaveFocus();
  });

  it("se referme après un clic sur un lien du menu", async () => {
    const user = userEvent.setup();
    renderAt("/reserver");
    const bouton = screen.getByRole("button", { name: "Menu" });

    await user.click(bouton);
    await user.click(screen.getByRole("link", { name: "Galerie" }));

    expect(screen.getByRole("heading", { level: 1, name: "Accueil" })).toBeInTheDocument();
    expect(bouton).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Layout : pied de page", () => {
  it("affiche le crédit du site", () => {
    renderAt("/reserver");
    expect(screen.getByText("Site conçu et développé par Thibault Brebion")).toBeInTheDocument();
  });
});
