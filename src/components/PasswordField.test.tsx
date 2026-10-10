import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PasswordField } from "@/components/PasswordField";

describe("PasswordField", () => {
  it("masque le mot de passe par défaut, l'affiche puis le masque au toucher", async () => {
    const user = userEvent.setup();
    render(
      <PasswordField
        id="pw"
        label="Mot de passe"
        autoComplete="current-password"
        defaultValue="x"
      />,
    );
    const input = screen.getByLabelText("Mot de passe");
    const toggle = screen.getByRole("button", { name: "Afficher le mot de passe" });

    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("autocomplete", "current-password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-controls", "pw");

    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Masquer le mot de passe" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("le bouton ne soumet pas le formulaire, et le texte n'est jamais corrigé automatiquement", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <PasswordField id="pw" label="Nouveau" autoComplete="new-password" />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(onSubmit).not.toHaveBeenCalled();
    const input = screen.getByLabelText("Nouveau");
    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("garde l'erreur reliée au champ", () => {
    render(
      <PasswordField
        id="pw"
        label="Mot de passe actuel"
        autoComplete="current-password"
        error="Mot de passe actuel incorrect."
      />,
    );
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveAccessibleDescription(
      "Mot de passe actuel incorrect.",
    );
  });
});
