import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase, resetSupabaseClient, SupabaseConfigError } from "@/lib/supabase";
import {
  ADMIN_AUTH_STORAGE_KEY,
  getSupabaseAdmin,
  resetSupabaseAdminClient,
} from "@/lib/supabaseAdmin";

// On ne crée jamais de vrai client : on vérifie seulement comment il serait créé.
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({ fake: true })) }));

// Valeurs factices : aucune vraie URL ni clé dans les tests.
const FAKE_URL = "https://projet-factice.supabase.test";
const FAKE_KEY = "cle-anon-factice";

beforeEach(() => {
  resetSupabaseClient();
  resetSupabaseAdminClient();
  vi.mocked(createClient).mockClear();
  vi.stubEnv("VITE_SUPABASE_URL", FAKE_URL);
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", FAKE_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseAdmin", () => {
  it("crée un seul client, avec session persistante sous une clé de stockage dédiée", () => {
    const first = getSupabaseAdmin();
    expect(getSupabaseAdmin()).toBe(first);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(FAKE_URL, FAKE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: "cutsbyalix-admin-auth",
        storage: globalThis.localStorage,
      },
    });
  });

  it("reste distinct du client public, qui garde ses options sans session", () => {
    const admin = getSupabaseAdmin();
    const visitor = getSupabase();

    expect(admin).not.toBe(visitor);
    expect(createClient).toHaveBeenLastCalledWith(FAKE_URL, FAKE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // La clé admin n'est pas celle qu'utiliserait supabase-js par défaut (« sb-…-auth-token »).
    expect(ADMIN_AUTH_STORAGE_KEY).not.toMatch(/^sb-/);
  });

  it("lève une SupabaseConfigError si une variable manque", () => {
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", " ");
    expect(() => getSupabaseAdmin()).toThrow(SupabaseConfigError);
    expect(createClient).not.toHaveBeenCalled();
  });
});
