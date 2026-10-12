import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "@/pages/NotFoundPage";

describe("NotFoundPage (K-05)", () => {
  it("demande aux moteurs de ne pas indexer la page (servie en 200 par le repli SPA)", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
    // React 19 place la balise <meta> dans le <head>.
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
    expect(screen.getByRole("link", { name: "Retour à l'accueil" })).toHaveAttribute("href", "/");
  });
});
