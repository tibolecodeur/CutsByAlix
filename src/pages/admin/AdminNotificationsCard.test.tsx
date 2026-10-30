import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminError } from "@/features/admin/data";
import * as push from "@/features/admin/push";
import { AdminNotificationsCard } from "@/pages/admin/AdminNotificationsCard";

// La logique (navigateur, RPC) est testée dans push.test.ts : ici, seulement l'affichage.
vi.mock("@/features/admin/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/push")>()),
  getPushStatus: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  disablePushEverywhere: vi.fn(),
  sendTestPush: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

async function renderWith(status: push.PushStatus) {
  vi.mocked(push.getPushStatus).mockResolvedValue(status);
  render(<AdminNotificationsCard />);
  await screen.findByRole("heading", { name: "Notifications" });
  // Attend la fin de la lecture de l'état (le message de chargement disparaît).
  await vi.waitFor(() =>
    expect(screen.queryByText("Vérification des notifications…")).not.toBeInTheDocument(),
  );
}

describe("AdminNotificationsCard", () => {
  it("iPhone dans Safari : marche à suivre pour l'écran d'accueil, aucun bouton d'activation", async () => {
    await renderWith("needs_install");
    expect(screen.getByText(/choisis « Sur l'écran d'accueil »/)).toBeInTheDocument();
    expect(screen.getByText(/iOS 16.4 ou plus récent/)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Couper les notifications sur tous mes appareils",
    ]);
  });

  it.each([
    ["unsupported", /ne permet pas les notifications/],
    ["not_configured", /pas encore configurées/],
    ["denied", /Réglages → Notifications → Alix admin/],
  ] as const)("%s : explication, aucun bouton d'activation", async (status, text) => {
    await renderWith(status);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Couper les notifications sur tous mes appareils",
    ]);
  });

  it("à activer : un toucher sur « Activer » abonne le téléphone", async () => {
    vi.mocked(push.enablePush).mockResolvedValue();
    await renderWith("off");
    await userEvent.click(screen.getByRole("button", { name: "Activer les notifications" }));

    expect(push.enablePush).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Notifications activées sur ce téléphone.",
    );
    expect(screen.getByText("Activées sur ce téléphone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Envoyer une notification de test" })).toBeEnabled();
  });

  it("autorisation refusée au moment d'activer : message et état « bloquées »", async () => {
    vi.mocked(push.enablePush).mockRejectedValue(new push.PushError("denied"));
    await renderWith("off");
    await userEvent.click(screen.getByRole("button", { name: "Activer les notifications" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Notifications refusées");
    expect(screen.getByText(/sont bloquées sur ce téléphone/)).toBeInTheDocument();
  });

  it("panne pendant l'activation : message, on peut réessayer", async () => {
    vi.mocked(push.enablePush).mockRejectedValue(new AdminError("unknown"));
    await renderWith("off");
    await userEvent.click(screen.getByRole("button", { name: "Activer les notifications" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vérifie ta connexion");
    expect(screen.getByRole("button", { name: "Activer les notifications" })).toBeEnabled();
  });

  it.each([
    ["queued", "elle arrive dans quelques secondes"],
    ["no_device", "désactive puis réactive"],
    ["not_configured", "pas encore branché"],
  ] as const)("notification de test, réponse %s : message adapté", async (result, text) => {
    vi.mocked(push.sendTestPush).mockResolvedValue(result);
    await renderWith("on");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer une notification de test" }));
    expect(await screen.findByRole("status")).toHaveTextContent(text);
  });

  it("session expirée pendant le test : message dédié", async () => {
    vi.mocked(push.sendTestPush).mockRejectedValue(new AdminError("forbidden"));
    await renderWith("on");
    await userEvent.click(screen.getByRole("button", { name: "Envoyer une notification de test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ta session a expiré");
  });

  it("« Désactiver » : désabonne et repropose l'activation", async () => {
    vi.mocked(push.disablePush).mockResolvedValue();
    await renderWith("on");
    await userEvent.click(screen.getByRole("button", { name: "Désactiver" }));

    expect(push.disablePush).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("Notifications désactivées");
    expect(screen.getByRole("button", { name: "Activer les notifications" })).toBeInTheDocument();
  });

  it("« Couper sur tous mes appareils » : tous les abonnements oubliés, ce téléphone compris", async () => {
    vi.mocked(push.disablePushEverywhere).mockResolvedValue(2);
    await renderWith("on");
    await userEvent.click(
      screen.getByRole("button", { name: "Couper les notifications sur tous mes appareils" }),
    );
    expect(push.disablePushEverywhere).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Notifications coupées sur tous tes appareils.",
    );
    expect(screen.getByRole("button", { name: "Activer les notifications" })).toBeInTheDocument();
  });

  it("lecture de l'état impossible : traité comme non supporté", async () => {
    vi.mocked(push.getPushStatus).mockRejectedValue(new Error("boom"));
    render(<AdminNotificationsCard />);
    expect(await screen.findByText(/ne permet pas les notifications/)).toBeInTheDocument();
  });
});
