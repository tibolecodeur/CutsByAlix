import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "@/features/admin/auth";
import { AdminAccountPage } from "@/pages/admin/AdminAccountPage";
import type { AdminContext } from "@/pages/admin/useAdmin";

/** Page « Mon compte », couche d'auth simulée. Mots de passe fictifs uniquement. */
vi.mock("@/features/admin/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/auth")>()),
  changePassword: vi.fn(),
}));

const onSignOut = vi.fn(async () => {});

function renderAccount() {
  const context: AdminContext = { session: { email: "admin@example.test" }, onSignOut };
  return render(
    <MemoryRouter initialEntries={["/admin/compte"]}>
      <Routes>
        <Route element={<Outlet context={context} />}>
          <Route path="admin/compte" element={<AdminAccountPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const NEW_PASSWORD = "phrase de passe factice";

async function fill(current: string, password: string, confirmation = password) {
  const user = userEvent.setup();
  if (current) await user.type(screen.getByLabelText("Mot de passe actuel"), current);
  if (password) await user.type(screen.getByLabelText("Nouveau mot de passe"), password);
  if (confirmation) {
    await user.type(screen.getByLabelText("Confirme le nouveau mot de passe"), confirmation);
  }
  await user.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
}

beforeEach(() => {
  vi.mocked(auth.changePassword).mockReset();
  onSignOut.mockClear();
});

describe("AdminAccountPage : changement de mot de passe", () => {
  it("demande l'ancien mot de passe et un nouveau de 12 caractères, identique deux fois", async () => {
    renderAccount();
    await fill("", "court", "autre");

    expect(screen.getByLabelText("Mot de passe actuel")).toHaveAccessibleDescription(
      "Indique ton mot de passe actuel.",
    );
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAccessibleDescription(
      /12 caractères minimum\./,
    );
    expect(screen.getByLabelText("Confirme le nouveau mot de passe")).toHaveAccessibleDescription(
      "Les deux mots de passe sont différents.",
    );
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it("champs compatibles avec les gestionnaires de mots de passe", () => {
    renderAccount();
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(document.querySelector('input[name="username"]')).toHaveValue("admin@example.test");
  });

  it("succès : confirmation claire, champs vidés", async () => {
    vi.mocked(auth.changePassword).mockResolvedValue({ otherDevicesSignedOut: true });
    renderAccount();
    await fill("ancien mot de passe", NEW_PASSWORD);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Mot de passe modifié. Tes autres appareils ont été déconnectés.",
    );
    expect(auth.changePassword).toHaveBeenCalledWith("ancien mot de passe", NEW_PASSWORD);
    expect(screen.getByLabelText("Nouveau mot de passe")).toHaveValue("");
  });

  it("succès, mais autres appareils non déconnectés : le dit", async () => {
    vi.mocked(auth.changePassword).mockResolvedValue({ otherDevicesSignedOut: false });
    renderAccount();
    await fill("ancien mot de passe", NEW_PASSWORD);

    expect(await screen.findByRole("status")).toHaveTextContent(/n'ont pas pu être déconnectés/);
  });

  it("ancien mot de passe faux : erreur sous le champ, rien d'autre", async () => {
    vi.mocked(auth.changePassword).mockRejectedValue(
      new auth.AdminAuthError("wrong_current_password"),
    );
    renderAccount();
    await fill("faux", NEW_PASSWORD);

    expect(await screen.findByText("Mot de passe actuel incorrect.")).toBeVisible();
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveValue("");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([
    ["same_password", /différent de l'actuel/],
    ["weak_password", /plus long ou moins courant/],
    ["too_many_attempts", /Trop de tentatives/],
    ["network", /n'a pas pu être changé/],
  ] as const)("refus %s : message adapté", async (code, message) => {
    vi.mocked(auth.changePassword).mockRejectedValue(new auth.AdminAuthError(code));
    renderAccount();
    await fill("ancien mot de passe", NEW_PASSWORD);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

describe("AdminAccountPage : déconnexion", () => {
  it("le bouton déconnecte", async () => {
    const user = userEvent.setup();
    renderAccount();
    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
