import type { SupabaseClient } from "@supabase/supabase-js";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { getSupabase } from "@/lib/supabase";
import { CancelPage } from "@/pages/CancelPage";

/**
 * Page /annuler avec la VRAIE couche données (src/features/booking/data.ts) et un client
 * Supabase simulé : aucune requête ne part. Les cas « mal formé » passent par `isUuid`, qui ne
 * doit même pas interroger la base.
 */
vi.mock("@/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase")>()),
  getSupabase: vi.fn(),
}));

const TOKEN = "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b";

const ROW = {
  status: "confirmed",
  starts_at: "2026-10-20T12:00:00+00:00", // mardi 20 octobre, 14 h à Paris
  ends_at: "2026-10-20T13:00:00+00:00",
  service_name: "Coupe + barbe",
  location_label: "Les Ponts-de-Cé",
  first_name: "Lucas",
  can_cancel: true,
  cancelled_by: null,
};

type Reply = { data: unknown; error: { code?: string; message: string } | null };

/** Client simulé : `handlers[nom]()` répond à `rpc(nom, …)`. Renvoie l'espion `rpc`. */
function mockRpc(handlers: Record<string, () => Promise<Reply>>) {
  const rpc = vi.fn((name: string) => {
    const promise = handlers[name]!();
    // `abortSignal` existe sur la vraie requête (get_booking) ; absent d'une promesse simple.
    return Object.assign(promise, { abortSignal: () => promise });
  });
  vi.mocked(getSupabase).mockReturnValue({ rpc } as unknown as SupabaseClient<Database>);
  return rpc;
}

const ok = (data: unknown): Promise<Reply> => Promise.resolve({ data, error: null });
const fail = (message: string, code?: string): Promise<Reply> =>
  Promise.resolve({ data: null, error: { message, code } });

function renderPage(url = `/annuler#${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CancelPage />
    </MemoryRouter>,
  );
}

const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
  vi.spyOn(console, method),
);

beforeEach(() => {
  consoleSpies.forEach((spy) => spy.mockClear());
  vi.mocked(getSupabase).mockReset();
});

afterEach(() => {
  // Le jeton ne doit jamais être écrit dans la console.
  const written = consoleSpies.flatMap((spy) => spy.mock.calls).map((args) => JSON.stringify(args));
  expect(written.filter((line) => line.includes(TOKEN))).toEqual([]);
});

describe("CancelPage : lien valide", () => {
  it("affiche le chargement, puis le récapitulatif sans adresse ni coordonnées", async () => {
    mockRpc({ get_booking: () => ok([ROW]) });
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Chargement de ton rendez-vous…");
    expect(await screen.findByRole("heading", { name: "Lucas, ton rendez-vous" })).toBeVisible();
    expect(screen.getByText("Coupe + barbe")).toBeVisible();
    expect(screen.getByText("mardi 20 octobre")).toBeVisible();
    expect(screen.getByText("14:00 – 15:00")).toBeVisible();
    expect(screen.getByText("Les Ponts-de-Cé")).toBeVisible();
    expect(screen.queryByText("Adresse")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(TOKEN);
  });

  it("annule en deux temps, envoie le jeton à la base et annonce « C'est annulé »", async () => {
    const user = userEvent.setup();
    const rpc = mockRpc({ get_booking: () => ok([ROW]), cancel_booking: () => ok(true) });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    expect(screen.getByText("L'annulation est définitive. Tu confirmes ?")).toBeVisible();
    expect(rpc).not.toHaveBeenCalledWith("cancel_booking", expect.anything());

    await user.click(screen.getByRole("button", { name: "Oui, annuler" }));
    const title = await screen.findByRole("heading", { name: "C'est annulé" });
    expect(title).toHaveFocus();
    expect(rpc).toHaveBeenCalledWith("cancel_booking", { p_token: TOKEN });
  });

  it("peut garder son rendez-vous après avoir demandé l'annulation", async () => {
    const user = userEvent.setup();
    const rpc = mockRpc({ get_booking: () => ok([ROW]) });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    await user.click(screen.getByRole("button", { name: "Garder mon rendez-vous" }));

    expect(screen.getByRole("button", { name: "Annuler mon rendez-vous" })).toBeVisible();
    expect(rpc).not.toHaveBeenCalledWith("cancel_booking", expect.anything());
  });

  it("double clic : une seule annulation envoyée", async () => {
    const user = userEvent.setup();
    let resolveCancel: (value: Reply) => void = () => {};
    const rpc = mockRpc({
      get_booking: () => ok([ROW]),
      cancel_booking: () => new Promise<Reply>((resolve) => (resolveCancel = resolve)),
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    const confirm = screen.getByRole("button", { name: "Oui, annuler" });

    // Deux clics dans le même rendu : le bouton n'est pas encore désactivé au second.
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(screen.getByRole("button", { name: "Annulation en cours…" })).toBeDisabled();
    await act(async () => resolveCancel({ data: true, error: null }));

    expect(await screen.findByRole("heading", { name: "C'est annulé" })).toBeVisible();
    expect(rpc.mock.calls.filter(([name]) => name === "cancel_booking")).toHaveLength(1);
  });

  // Consigne 25 (C-02) : avant, `false` affichait « C'est annulé », même quand Alix avait
  // annulé entre-temps. On dit désormais ce qui est vrai : le RDV était déjà annulé.
  it("répond « déjà annulé » si la base répond false (rejeu après coupure, ou annulé entre-temps)", async () => {
    const user = userEvent.setup();
    mockRpc({ get_booking: () => ok([ROW]), cancel_booking: () => ok(false) });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    await user.click(screen.getByRole("button", { name: "Oui, annuler" }));

    const title = await screen.findByRole("heading", { name: "Rendez-vous déjà annulé" });
    expect(title).toHaveFocus();
    expect(screen.getByText(/Tu n'as rien d'autre à faire/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "C'est annulé" })).not.toBeInTheDocument();
  });
});

describe("CancelPage : réponses inattendues (C-02)", () => {
  it.each([
    ["vide", null],
    ["de forme inattendue", { unexpected: true }],
  ])(
    "annulation, réponse %s : message d'erreur et nouvel essai, jamais « C'est annulé »",
    async (_label, data) => {
      const user = userEvent.setup();
      let attempt = 0;
      mockRpc({
        get_booking: () => ok([ROW]),
        cancel_booking: () => (attempt++ === 0 ? ok(data) : ok(true)),
      });
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
      await user.click(screen.getByRole("button", { name: "Oui, annuler" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /L'annulation n'a pas pu être envoyée/,
      );
      expect(screen.queryByRole("heading", { name: "C'est annulé" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Oui, annuler" }));
      expect(await screen.findByRole("heading", { name: "C'est annulé" })).toBeVisible();
    },
  );

  it("chargement, réponse de forme inattendue : erreur et « Réessayer », pas « Lien invalide »", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockRpc({ get_booking: () => (attempt++ === 0 ? ok({ unexpected: true }) : ok([ROW])) });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Impossible de charger/);
    expect(screen.queryByRole("heading", { name: "Lien invalide" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Lucas, ton rendez-vous" })).toBeVisible();
  });
});

describe("CancelPage : trop tard et déjà annulé", () => {
  it("affiche « Trop tard » sans bouton d'annulation quand can_cancel est faux", async () => {
    mockRpc({ get_booking: () => ok([{ ...ROW, can_cancel: false }]) });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Trop tard pour annuler en ligne" }),
    ).toBeVisible();
    expect(screen.getByText(/jusqu'à 24 h avant/)).toBeVisible();
    expect(screen.getByText(/Il est trop tard pour annuler en ligne/)).toBeVisible();
    expect(screen.getByText(/contacte Alix directement sur Instagram/)).toBeVisible();
    // Lien Instagram dans un nouvel onglet ; le jeton n'y est jamais ajouté.
    const instagram = screen.getByRole("link", { name: /@CutsByAlix sur Instagram/ });
    expect(instagram).toHaveAttribute("href", "https://www.instagram.com/cutsbyalix/");
    expect(instagram).toHaveAttribute("target", "_blank");
    expect(instagram.getAttribute("rel")?.split(" ")).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
    expect(document.body.innerHTML).not.toContain(TOKEN);
    // Message clair, pas une erreur technique.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Annuler mon rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("passe à « Trop tard » si la base refuse (too_late) au moment d'annuler", async () => {
    const user = userEvent.setup();
    mockRpc({
      get_booking: () => ok([ROW]),
      cancel_booking: () => fail("too_late", "P0001"),
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    await user.click(screen.getByRole("button", { name: "Oui, annuler" }));

    const title = await screen.findByRole("heading", { name: "Trop tard pour annuler en ligne" });
    expect(title).toHaveFocus();
    expect(screen.getByText(/contacte Alix directement sur Instagram/)).toBeVisible();
    expect(screen.getByRole("link", { name: /@CutsByAlix sur Instagram/ })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("affiche « Rendez-vous déjà annulé » sans bouton d'annulation", async () => {
    mockRpc({
      get_booking: () =>
        ok([{ ...ROW, status: "cancelled", can_cancel: false, cancelled_by: "client" }]),
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Rendez-vous déjà annulé" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Annuler mon rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("annulé par Alix : message distinct de « déjà annulé », avec « Réserver un créneau »", async () => {
    mockRpc({
      get_booking: () =>
        ok([{ ...ROW, status: "cancelled", can_cancel: false, cancelled_by: "barber" }]),
    });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Rendez-vous annulé par Alix" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Alix a annulé ton rendez-vous du mardi 20 octobre à 14:00/),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Rendez-vous déjà annulé" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Réserver un créneau" })).toHaveAttribute(
      "href",
      "/reserver",
    );
    expect(
      screen.queryByRole("button", { name: "Annuler mon rendez-vous" }),
    ).not.toBeInTheDocument();
  });
});

describe("CancelPage : lien invalide", () => {
  const INVALID = "Lien invalide";

  it("affiche le même écran pour un jeton inconnu ou expiré (la base renvoie 0 ligne)", async () => {
    mockRpc({ get_booking: () => ok([]) });
    const { container, unmount } = renderPage();
    await screen.findByRole("heading", { name: INVALID });
    const unknownHtml = container.innerHTML;
    unmount();

    // « Expiré » : la base répond exactement pareil (0 ligne), donc exactement le même écran.
    mockRpc({ get_booking: () => ok([]) });
    const expired = renderPage(`/annuler#aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`);
    await screen.findByRole("heading", { name: INVALID });
    expect(expired.container.innerHTML).toBe(unknownHtml);
  });

  it("affiche le même écran, sans interroger la base, pour un jeton absent ou mal formé", async () => {
    const rpc = mockRpc({ get_booking: () => ok([ROW]) });
    const reference = renderPage("/annuler");
    expect(await screen.findByRole("heading", { name: INVALID })).toBeVisible();
    const referenceHtml = reference.container.innerHTML;
    reference.unmount();

    const malformed = renderPage("/annuler#pas-un-uuid");
    expect(await screen.findByRole("heading", { name: INVALID })).toBeVisible();
    expect(malformed.container.innerHTML).toBe(referenceHtml);
    expect(rpc).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Annuler mon rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("ne reconnaît plus l'ancien format ?token= : lien invalide, la base n'est pas interrogée", async () => {
    const rpc = mockRpc({ get_booking: () => ok([ROW]) });
    renderPage(`/annuler?token=${TOKEN}`);

    expect(await screen.findByRole("heading", { name: INVALID })).toBeVisible();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lit le jeton dans le fragment : la base le reçoit dans le corps de la requête", async () => {
    const rpc = mockRpc({ get_booking: () => ok([ROW]) });
    renderPage(`/annuler#${TOKEN}`);

    await screen.findByRole("heading", { name: "Lucas, ton rendez-vous" });
    expect(rpc).toHaveBeenCalledWith("get_booking", { p_token: TOKEN });
  });
});

describe("CancelPage : erreurs réseau", () => {
  it("propose « Réessayer » quand le chargement échoue, sans afficher le jeton", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockRpc({
      get_booking: () => (attempt++ === 0 ? fail(`échec ${TOKEN}`) : ok([ROW])),
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Impossible de charger/);
    expect(document.body).not.toHaveTextContent(TOKEN);
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { name: "Lucas, ton rendez-vous" })).toBeVisible();
  });

  it("garde le bouton quand l'annulation échoue, et permet de réessayer", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockRpc({
      get_booking: () => ok([ROW]),
      cancel_booking: () => (attempt++ === 0 ? fail(`réseau ${TOKEN}`) : ok(true)),
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Annuler mon rendez-vous" }));
    await user.click(screen.getByRole("button", { name: "Oui, annuler" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /L'annulation n'a pas pu être envoyée/,
    );
    expect(document.body).not.toHaveTextContent(TOKEN);
    await user.click(screen.getByRole("button", { name: "Oui, annuler" }));
    expect(await screen.findByRole("heading", { name: "C'est annulé" })).toBeVisible();
  });
});
