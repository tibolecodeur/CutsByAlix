import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { ADMIN_AUTH_STORAGE_KEY, getSupabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Authentification de l'espace admin (Supabase Auth, compte unique créé à la main : aucune
 * inscription possible). Les écrans n'importent QUE ces fonctions.
 *
 * « Connecté » ne suffit pas : il faut une ligne dans `public.admins`. Le front la vérifie en
 * lisant SA propre ligne (la RLS ne montre rien à un non-admin) ; ce n'est qu'un confort
 * d'affichage, la vraie barrière reste la RLS de chaque table.
 *
 * Règles de sécurité appliquées ici :
 * - une erreur d'identification donne TOUJOURS le même code (`invalid_credentials`), que l'e-mail
 *   existe ou non, que le compte soit confirmé ou non, qu'il soit admin ou non : on ne révèle
 *   jamais l'existence d'un compte ;
 * - aucun message brut de Supabase n'est recopié, rien n'est écrit dans la console.
 */

export type AdminSession = { email: string };

/** Longueur minimale d'un mot de passe admin (aucune autre règle de complexité). */
export const MIN_PASSWORD_LENGTH = 12;

export type AdminAuthErrorCode =
  | "invalid_credentials"
  | "too_many_attempts"
  | "network"
  | "wrong_current_password"
  | "weak_password"
  | "same_password"
  | "not_signed_in"
  | "unknown";

export class AdminAuthError extends Error {
  readonly code: AdminAuthErrorCode;

  constructor(code: AdminAuthErrorCode) {
    super(code);
    this.name = "AdminAuthError";
    this.code = code;
  }
}

function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

/** Erreur d'identification → code neutre. Seuls le réseau et le trop-plein de tentatives diffèrent. */
function credentialsErrorCode(
  error: AuthError,
  wrong: "invalid_credentials" | "wrong_current_password",
): AdminAuthErrorCode {
  if (isAuthRetryableFetchError(error)) return "network";
  if (isRateLimited(error)) return "too_many_attempts";
  return wrong;
}

/** Le client admin ; une config absente est traitée comme une panne (« réessaie plus tard »). */
function client() {
  try {
    return getSupabaseAdmin();
  } catch {
    throw new AdminAuthError("network");
  }
}

/**
 * Vrai si l'utilisateur a sa ligne dans `admins`. La requête porte le jeton : le serveur le
 * valide (un jeton expiré ou falsifié renvoie 401 → pas admin).
 */
async function isAdmin(userId: string): Promise<boolean> {
  const { data, error, status } = await client()
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    if (status === 401 || status === 403) return false;
    throw new AdminAuthError("network");
  }
  return data.length > 0;
}

/**
 * Efface la session de CE navigateur (déconnexion « locale » : les autres appareils restent
 * connectés). supabase-js efface déjà son stockage, même hors ligne ; on le refait quand même,
 * clé par clé, pour ne jamais laisser de jeton derrière soi.
 */
async function clearLocalSession(): Promise<void> {
  try {
    await client().auth.signOut({ scope: "local" });
  } catch {
    // Hors ligne ou config absente : le stockage est vidé juste après.
  } finally {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(ADMIN_AUTH_STORAGE_KEY)) localStorage.removeItem(key);
      }
    } catch {
      // Stockage refusé (navigation privée stricte) : rien n'y a été écrit.
    }
  }
}

/**
 * Connexion par e-mail et mot de passe. Un compte valide mais absent de `admins` est
 * aussitôt déconnecté et reçoit le même refus qu'un mauvais mot de passe.
 */
export async function signIn(email: string, password: string): Promise<AdminSession> {
  const auth = client().auth;
  let result;
  try {
    result = await auth.signInWithPassword({ email: email.trim(), password });
  } catch {
    throw new AdminAuthError("network");
  }
  if (result.error)
    throw new AdminAuthError(credentialsErrorCode(result.error, "invalid_credentials"));

  const user = result.data.user;
  let admin: boolean;
  try {
    admin = await isAdmin(user.id);
  } catch (caught) {
    await clearLocalSession();
    throw caught;
  }
  if (!admin) {
    await clearLocalSession();
    throw new AdminAuthError("invalid_credentials");
  }
  return { email: user.email ?? email.trim() };
}

/**
 * Session admin en cours (gardée dans ce navigateur), ou `null`. Une session invalide ou d'un
 * non-admin est effacée. Lève `network` si le serveur est injoignable (on ne déconnecte pas
 * Alix pour une coupure de réseau).
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const auth = client().auth;
  const { data, error } = await auth.getSession();
  if (error) {
    if (isAuthRetryableFetchError(error)) throw new AdminAuthError("network");
    await clearLocalSession();
    return null;
  }
  const session = data.session;
  if (!session) return null;

  if (!(await isAdmin(session.user.id))) {
    await clearLocalSession();
    return null;
  }
  return { email: session.user.email ?? "" };
}

/** Déconnexion de ce navigateur. Ne lève jamais : la session locale est effacée quoi qu'il arrive. */
export async function signOut(): Promise<void> {
  await clearLocalSession();
}

/**
 * Prévient quand la session disparaît (jeton de rafraîchissement révoqué, déconnexion dans un
 * autre onglet…). Renvoie la fonction de désabonnement.
 */
export function onAdminSignedOut(callback: () => void): () => void {
  try {
    const { data } = client().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") callback();
    });
    return () => data.subscription.unsubscribe();
  } catch {
    return () => {};
  }
}

/**
 * Changement de mot de passe : l'ANCIEN est redemandé (nouvelle authentification), puis le
 * nouveau est enregistré, puis les autres appareils sont déconnectés. Renvoie `false` si cette
 * dernière étape a échoué (le mot de passe est changé quand même).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ otherDevicesSignedOut: boolean }> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new AdminAuthError("weak_password");
  const auth = client().auth;

  const { data } = await auth.getSession();
  const email = data.session?.user.email;
  if (!email) throw new AdminAuthError("not_signed_in");

  let reauth;
  try {
    reauth = await auth.signInWithPassword({ email, password: currentPassword });
  } catch {
    throw new AdminAuthError("network");
  }
  if (reauth.error) {
    throw new AdminAuthError(credentialsErrorCode(reauth.error, "wrong_current_password"));
  }

  let update;
  try {
    update = await auth.updateUser({ password: newPassword });
  } catch {
    throw new AdminAuthError("network");
  }
  if (update.error) {
    const error = update.error;
    if (isAuthRetryableFetchError(error)) throw new AdminAuthError("network");
    if (error.code === "same_password") throw new AdminAuthError("same_password");
    if (error.code === "weak_password" || error.status === 422) {
      throw new AdminAuthError("weak_password");
    }
    throw new AdminAuthError("unknown");
  }

  try {
    const { error } = await auth.signOut({ scope: "others" });
    return { otherDevicesSignedOut: !error };
  } catch {
    return { otherDevicesSignedOut: false };
  }
}
