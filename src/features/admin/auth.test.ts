import { AuthApiError, AuthRetryableFetchError, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthError,
  changePassword,
  getAdminSession,
  MIN_PASSWORD_LENGTH,
  onAdminSignedOut,
  signIn,
  signOut,
} from "@/features/admin/auth";
import type { Database } from "@/lib/database.types";
import { SupabaseConfigError } from "@/lib/supabase";
import { ADMIN_AUTH_STORAGE_KEY, getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Couche d'authentification admin avec un client Supabase SIMULÉ : aucune requête ne part.
 * Identifiants fictifs uniquement.
 */
vi.mock("@/lib/supabaseAdmin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabaseAdmin")>()),
  getSupabaseAdmin: vi.fn(),
}));

const USER = { id: "30000000-0000-4000-8000-000000000001", email: "admin@example.test" };
const SESSION = { access_token: "jeton-factice", user: USER };

type AdminsReply = { data: unknown[] | null; error: { message: string } | null; status: number };

function fakeClient(
  { admins = { data: [{ user_id: USER.id }], error: null, status: 200 } } = {} as {
    admins?: AdminsReply;
  },
) {
  const auth = {
    signInWithPassword: vi.fn(async () => ({
      data: { user: USER, session: SESSION },
      error: null,
    })),
    getSession: vi.fn(async () => ({ data: { session: SESSION }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ data: { user: USER }, error: null })),
    onAuthStateChange: vi.fn(),
  };
  const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(async () => admins) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    auth,
    from,
  } as unknown as SupabaseClient<Database>);
  return { auth, from, query };
}

const invalid = () => new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
const offline = () => new AuthRetryableFetchError("Failed to fetch", 0);

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AdminAuthError);
  await expect(promise).rejects.toMatchObject({ code });
}

beforeEach(() => {
  vi.mocked(getSupabaseAdmin).mockReset();
  localStorage.clear();
});

describe("signIn", () => {
  it("connecte un admin : identifiants envoyés, puis vérification de SA ligne admins", async () => {
    const { auth, from, query } = fakeClient();

    expect(await signIn("  admin@example.test ", "mot-de-passe-factice")).toEqual({
      email: "admin@example.test",
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.test",
      password: "mot-de-passe-factice",
    });
    expect(from).toHaveBeenCalledWith("admins");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER.id);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ["mauvais identifiants", invalid()],
    ["e-mail non confirmé", new AuthApiError("Email not confirmed", 400, "email_not_confirmed")],
    ["utilisateur banni", new AuthApiError("User is banned", 400, "user_banned")],
    ["erreur inattendue", new AuthApiError("Boom", 500, "unexpected_failure")],
  ])("même code neutre pour : %s", async (_cas, error) => {
    const { auth } = fakeClient();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error,
    } as never);
    await expectCode(signIn("x@example.test", "y"), "invalid_credentials");
  });

  it("compte valide mais absent de admins : déconnecté aussitôt, même code neutre", async () => {
    const { auth } = fakeClient({ admins: { data: [], error: null, status: 200 } });
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "{session}");

    await expectCode(signIn("autre@example.test", "mot-de-passe-factice"), "invalid_credentials");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)).toBeNull();
  });

  it("distingue seulement le réseau et le trop-plein de tentatives", async () => {
    const { auth } = fakeClient();
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: offline() } as never);
    await expectCode(signIn("x@example.test", "y"), "network");

    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError("Too many requests", 429, "over_request_rate_limit"),
    } as never);
    await expectCode(signIn("x@example.test", "y"), "too_many_attempts");

    auth.signInWithPassword.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expectCode(signIn("x@example.test", "y"), "network");
  });

  it("réseau coupé pendant la vérification admin : session effacée, code réseau", async () => {
    const { auth } = fakeClient({
      admins: { data: null, error: { message: "Failed to fetch" }, status: 0 },
    });
    await expectCode(signIn("admin@example.test", "y"), "network");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("config Supabase absente : code réseau, sans planter", async () => {
    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new SupabaseConfigError();
    });
    await expectCode(signIn("x@example.test", "y"), "network");
  });

  it("ne recopie jamais le message de Supabase dans l'erreur", async () => {
    const { auth } = fakeClient();
    auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError("Détail interne admin@example.test", 400, "invalid_credentials"),
    } as never);
    const error = await signIn("admin@example.test", "y").catch((caught: unknown) => caught);
    expect((error as Error).message).toBe("invalid_credentials");
  });
});

describe("getAdminSession", () => {
  it("renvoie la session si elle existe ET que l'utilisateur est admin", async () => {
    fakeClient();
    expect(await getAdminSession()).toEqual({ email: "admin@example.test" });
  });

  it("renvoie null sans session, sans interroger admins", async () => {
    const { auth, from } = fakeClient();
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    expect(await getAdminSession()).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["non admin (0 ligne)", { data: [], error: null, status: 200 }],
    [
      "jeton refusé par le serveur (401)",
      { data: null, error: { message: "JWT expired" }, status: 401 },
    ],
  ])("efface la session et renvoie null : %s", async (_cas, admins) => {
    const { auth } = fakeClient({ admins });
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "{session}");
    expect(await getAdminSession()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)).toBeNull();
  });

  it("session illisible (jeton de rafraîchissement révoqué) : effacée, null", async () => {
    const { auth } = fakeClient();
    auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    } as never);
    expect(await getAdminSession()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("réseau coupé : lève « network » sans déconnecter", async () => {
    const { auth } = fakeClient({
      admins: { data: null, error: { message: "Failed to fetch" }, status: 0 },
    });
    await expectCode(getAdminSession(), "network");
    expect(auth.signOut).not.toHaveBeenCalled();

    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: offline() } as never);
    await expectCode(getAdminSession(), "network");
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("déconnecte CE navigateur et vide toutes les clés de session admin", async () => {
    const { auth } = fakeClient();
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "{session}");
    localStorage.setItem(`${ADMIN_AUTH_STORAGE_KEY}-user`, "{user}");
    localStorage.setItem("autre-cle", "garde");

    await signOut();

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(`${ADMIN_AUTH_STORAGE_KEY}-user`)).toBeNull();
    expect(localStorage.getItem("autre-cle")).toBe("garde");
  });

  it("vide le stockage même si Supabase est injoignable", async () => {
    const { auth } = fakeClient();
    auth.signOut.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    localStorage.setItem(ADMIN_AUTH_STORAGE_KEY, "{session}");

    await expect(signOut()).resolves.toBeUndefined();
    expect(localStorage.getItem(ADMIN_AUTH_STORAGE_KEY)).toBeNull();
  });
});

describe("onAdminSignedOut", () => {
  it("prévient seulement sur SIGNED_OUT et se désabonne", () => {
    const { auth } = fakeClient();
    const unsubscribe = vi.fn();
    let listener: (event: string) => void = () => {};
    auth.onAuthStateChange.mockImplementation((callback: (event: string) => void) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    });
    const callback = vi.fn();

    const stop = onAdminSignedOut(callback);
    listener("TOKEN_REFRESHED");
    listener("SIGNED_IN");
    expect(callback).not.toHaveBeenCalled();
    listener("SIGNED_OUT");
    expect(callback).toHaveBeenCalledTimes(1);

    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("changePassword", () => {
  const NEW_PASSWORD = "nouveau-mot-de-passe-factice";

  it("redemande l'ancien, enregistre le nouveau, déconnecte les autres appareils", async () => {
    const { auth } = fakeClient();

    expect(await changePassword("ancien-factice", NEW_PASSWORD)).toEqual({
      otherDevicesSignedOut: true,
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.test",
      password: "ancien-factice",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: NEW_PASSWORD });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it(`refuse moins de ${MIN_PASSWORD_LENGTH} caractères sans rien envoyer, accepte 12 pile`, async () => {
    const { auth } = fakeClient();
    await expectCode(changePassword("ancien", "a".repeat(11)), "weak_password");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();

    // 12 caractères, sans majuscule, chiffre ni symbole : accepté (aucune autre règle).
    await expect(changePassword("ancien", "abcdefghijkl")).resolves.toBeDefined();
  });

  it("ancien mot de passe faux : refus, rien n'est changé", async () => {
    const { auth } = fakeClient();
    auth.signInWithPassword.mockResolvedValueOnce({ data: {}, error: invalid() } as never);
    await expectCode(changePassword("faux", NEW_PASSWORD), "wrong_current_password");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["same_password", new AuthApiError("Same", 422, "same_password"), "same_password"],
    ["weak_password", new AuthApiError("Weak", 422, "weak_password"), "weak_password"],
    ["réseau", offline(), "network"],
    ["autre", new AuthApiError("Boom", 500, "unexpected_failure"), "unknown"],
  ])("traduit le refus du serveur : %s", async (_cas, error, code) => {
    const { auth } = fakeClient();
    auth.updateUser.mockResolvedValueOnce({ data: { user: null }, error } as never);
    await expectCode(changePassword("ancien", NEW_PASSWORD), code);
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("sans session : not_signed_in", async () => {
    const { auth } = fakeClient();
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    await expectCode(changePassword("ancien", NEW_PASSWORD), "not_signed_in");
  });

  it("signale si les autres appareils n'ont pas pu être déconnectés", async () => {
    const { auth } = fakeClient();
    auth.signOut.mockResolvedValueOnce({ error: offline() } as never);
    expect(await changePassword("ancien", NEW_PASSWORD)).toEqual({ otherDevicesSignedOut: false });
  });
});
