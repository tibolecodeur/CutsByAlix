import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstagramLink } from "@/components/InstagramLink";

describe("InstagramLink", () => {
  it("ouvre le compte d'Alix dans un nouvel onglet, sans opener ni referrer", () => {
    render(<InstagramLink />);
    const link = screen.getByRole("link", {
      name: "Écrire à @CutsByAlix sur Instagram (s'ouvre dans un nouvel onglet)",
    });
    expect(link).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")?.split(" ")).toEqual(["noopener", "noreferrer"]);
    // Zone tactile de 44 px (lien seul sur sa ligne).
    expect(link).toHaveClass("min-h-tap");
  });
});
