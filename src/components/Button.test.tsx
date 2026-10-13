import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink } from "@/components/Button";

describe("Button", () => {
  it("est un bouton de type « button » par défaut (ne soumet pas un formulaire)", () => {
    render(<Button>Envoyer</Button>);
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveAttribute("type", "button");
  });

  it("accepte type « submit » et la variante principale orange à texte noir", () => {
    render(<Button type="submit">Confirmer</Button>);
    const bouton = screen.getByRole("button", { name: "Confirmer" });
    expect(bouton).toHaveAttribute("type", "submit");
    expect(bouton).toHaveClass(
      "bg-orange",
      "text-ink",
      "border-orange",
      "rounded-pill",
      "min-h-button",
    );
  });

  it("variante secondaire : contour, sans fond rose", () => {
    render(<Button variant="secondary">Annuler</Button>);
    const bouton = screen.getByRole("button", { name: "Annuler" });
    expect(bouton).toHaveClass("border-2");
    expect(bouton).not.toHaveClass("bg-orange");
  });
});

describe("ButtonLink", () => {
  it("est un lien de navigation qui a l'apparence d'un bouton", () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/reserver" className="w-full">
          Réserver
        </ButtonLink>
      </MemoryRouter>,
    );
    const lien = screen.getByRole("link", { name: "Réserver" });
    expect(lien).toHaveAttribute("href", "/reserver");
    expect(lien).toHaveClass("bg-orange", "w-full");
  });
});
