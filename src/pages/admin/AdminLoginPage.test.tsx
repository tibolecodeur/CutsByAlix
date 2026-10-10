import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "@/features/admin/auth";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";

/** Page de connexion, couche d'auth simulée. Identifiants fictifs uniquement. */
vi.mock("@/features/admin/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/auth")>()),
  getAdminSession: vi.fn(),
  signIn: vi.fn(),
}));

function renderLogin(from?: string) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: "/admin/connexion", state: from ? { from } : null }]}
    >
      <Routes>
        <Route path="admin/connexion" element={<AdminLoginPage />} />
        <Route path="admin" element={<h1>Tableau de bord</h1>} />
        <Route path="admin/rendez-vous" element={<h1>Rendez-vous</h1>} />
        <Route path="*" element={<h1>Ailleurs</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submit(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("E-mail"), email);
  if (password) await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
}

beforeEach(() => {
  vi.mocked(auth.getAdminSession).mockReset().mockResolvedValue(null);
  vi.mocked(auth.signIn).mockReset();
});

describe("AdminLoginPage", () => {
  it("propose des champs compatibles avec les gestionnaires de mots de passe", () => {
    renderLogin();
    const email = screen.getByLabelText("E-mail");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAttribute("autocapitalize", "none");
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByRole("button", { name: "Afficher le mot de passe" })).toBeVisible();
    // Aucun lien d'inscription ni de réinitialisation par e-mail.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });

  it("demande les deux champs avant d'appeler Supabase", async () => {
    renderLogin();
    await submit("", "");
    expect(screen.getByRole("alert")).toHaveTextContent("Indique ton e-mail et ton mot de passe.");
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it("mauvais identifiants : un seul message neutre, mot de passe vidé", async () => {
    vi.mocked(auth.signIn).mockRejectedValue(new auth.AdminAuthError("invalid_credentials"));
    renderLogin();
    await submit("inconnu@example.test", "mauvais-mot-de-passe");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^E-mail ou mot de passe incorrect\.$/,
    );
    expect(screen.getByLabelText("Mot de passe")).toHaveValue("");
    expect(screen.getByLabelText("E-mail")).toHaveValue("inconnu@example.test");
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it.each([
    ["too_many_attempts", /Trop de tentatives/],
    ["network", /Connexion impossible pour le moment/],
    ["unknown", /Connexion impossible pour le moment/],
  ] as const)("erreur %s : message adapté, sans parler du compte", async (code, message) => {
    vi.mocked(auth.signIn).mockRejectedValue(new auth.AdminAuthError(code));
    renderLogin();
    await submit("admin@example.test", "mot-de-passe-factice");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent(/existe|inconnu|admin/i);
  });

  it("connexion réussie : retour à la page demandée avant la redirection", async () => {
    vi.mocked(auth.signIn).mockResolvedValue({ email: "admin@example.test" });
    renderLogin("/admin/rendez-vous");
    await submit("admin@example.test", "mot-de-passe-factice");

    expect(await screen.findByRole("heading", { name: "Rendez-vous" })).toBeVisible();
    expect(auth.signIn).toHaveBeenCalledWith("admin@example.test", "mot-de-passe-factice");
  });

  it.each([
    "/reserver",
    "//site-pirate.example",
    "https://site-pirate.example/admin",
    "/admin/../x",
  ])("page de retour hors admin (%s) : tableau de bord", async (from) => {
    vi.mocked(auth.signIn).mockResolvedValue({ email: "admin@example.test" });
    renderLogin(from);
    await submit("admin@example.test", "mot-de-passe-factice");

    expect(await screen.findByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  });

  it("déjà connecté sur ce téléphone : direction l'admin", async () => {
    vi.mocked(auth.getAdminSession).mockResolvedValue({ email: "admin@example.test" });
    renderLogin();
    expect(await screen.findByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  });
});
