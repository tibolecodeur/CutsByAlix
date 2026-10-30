import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "@/features/admin/auth";
import * as push from "@/features/admin/push";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { useAdmin } from "@/pages/admin/useAdmin";

/**
 * Garde de l'espace admin : sans session admin vérifiée, AUCUNE page admin n'est montée (donc
 * aucune donnée chargée) et on est redirigé vers la connexion. Couche d'auth simulée.
 */
vi.mock("@/features/admin/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/auth")>()),
  getAdminSession: vi.fn(),
  onAdminSignedOut: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/features/admin/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/push")>()),
  forgetThisPushDevice: vi.fn(async () => {}),
}));

// jsdom ne fait pas défiler la page : on neutralise les appels de useScrollToHash.
beforeAll(() => {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

/** Page admin témoin : note chaque montage (une vraie page chargerait ses données ici). */
const mounted = vi.fn();
function ProbePage() {
  mounted();
  const { session, onSignOut } = useAdmin();
  return (
    <>
      <h1>Page protégée de {session.email}</h1>
      <button type="button" onClick={() => void onSignOut()}>
        Sortir
      </button>
    </>
  );
}

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "aucune";
  return <h1>Connexion (retour vers {from})</h1>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="admin/connexion" element={<LoginProbe />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<ProbePage />} />
          <Route path="rendez-vous" element={<ProbePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

let signedOutListener: () => void = () => {};

beforeEach(() => {
  mounted.mockClear();
  vi.mocked(auth.getAdminSession).mockReset();
  vi.mocked(auth.signOut).mockReset().mockResolvedValue(undefined);
  vi.mocked(auth.onAdminSignedOut)
    .mockReset()
    .mockImplementation((callback) => {
      signedOutListener = callback;
      return () => {};
    });
});

describe("AdminLayout : garde de l'espace admin", () => {
  it("sans session : redirige vers la connexion en retenant la page, sans monter la page", async () => {
    vi.mocked(auth.getAdminSession).mockResolvedValue(null);
    renderAt("/admin/rendez-vous");

    expect(
      await screen.findByRole("heading", { name: "Connexion (retour vers /admin/rendez-vous)" }),
    ).toBeVisible();
    expect(mounted).not.toHaveBeenCalled();
  });

  it("pendant la vérification : chargement, aucune page montée", () => {
    vi.mocked(auth.getAdminSession).mockReturnValue(new Promise(() => {}));
    renderAt("/admin");

    expect(screen.getByRole("status")).toHaveTextContent("Chargement…");
    expect(mounted).not.toHaveBeenCalled();
  });

  it("avec une session admin : affiche la page, la navigation, le manifeste et noindex", async () => {
    vi.mocked(auth.getAdminSession).mockResolvedValue({ email: "admin@example.test" });
    renderAt("/admin");

    expect(
      await screen.findByRole("heading", { name: "Page protégée de admin@example.test" }),
    ).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Navigation admin" })).toBeVisible();
    expect(document.head.querySelector('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/admin.webmanifest",
    );
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex",
    );
  });

  it("réseau coupé au contrôle : message et « Réessayer », sans déconnexion", async () => {
    const user = userEvent.setup();
    vi.mocked(auth.getAdminSession)
      .mockRejectedValueOnce(new auth.AdminAuthError("network"))
      .mockResolvedValueOnce({ email: "admin@example.test" });
    renderAt("/admin");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Impossible de vérifier/);
    expect(mounted).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: /Page protégée/ })).toBeVisible();
  });

  it("session perdue en cours d'utilisation (SIGNED_OUT) : retour à la connexion", async () => {
    vi.mocked(auth.getAdminSession).mockResolvedValue({ email: "admin@example.test" });
    renderAt("/admin");
    await screen.findByRole("heading", { name: /Page protégée/ });

    act(() => signedOutListener());
    expect(await screen.findByRole("heading", { name: /^Connexion/ })).toBeVisible();
  });

  it("déconnexion depuis une page : session effacée puis connexion", async () => {
    const user = userEvent.setup();
    vi.mocked(auth.getAdminSession).mockResolvedValue({ email: "admin@example.test" });
    renderAt("/admin");

    await user.click(await screen.findByRole("button", { name: "Sortir" }));
    // Ce téléphone ne reçoit plus les notifications, PUIS la session est effacée.
    expect(push.forgetThisPushDevice).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: /^Connexion/ })).toBeVisible();
  });
});
