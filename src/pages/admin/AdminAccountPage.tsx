import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/Button";
import { PageMeta } from "@/components/PageMeta";
import { PasswordField } from "@/components/PasswordField";
import { Section } from "@/components/Section";
import { ErrorMessage, SuccessMessage } from "@/components/StatusMessage";
import {
  AdminAuthError,
  changePassword,
  MIN_PASSWORD_LENGTH,
  type AdminAuthErrorCode,
} from "@/features/admin/auth";
import { AdminNotificationsCard } from "@/pages/admin/AdminNotificationsCard";
import { useAdmin } from "@/pages/admin/useAdmin";

/** Mon compte : notifications, changer de mot de passe, se déconnecter. */
export function AdminAccountPage() {
  const { session, onSignOut } = useAdmin();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await onSignOut();
  }

  return (
    <>
      <PageMeta title="Mon compte" description="Notifications, mot de passe et déconnexion." />
      <Section>
        <h1>Mon compte</h1>
        <p className="break-all">Connecté avec {session.email}</p>
      </Section>
      <Section>
        <AdminNotificationsCard />
      </Section>
      <Section>
        <PasswordForm email={session.email} />
      </Section>
      <Section>
        <h2>Se déconnecter</h2>
        <p>
          Tu restes connectée sur ce téléphone, même après avoir fermé le navigateur. Déconnecte-toi
          sur un téléphone ou un ordinateur partagé.
        </p>
        <p>
          <Button
            variant="secondary"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full sm:w-auto"
          >
            Se déconnecter
          </Button>
        </p>
      </Section>
    </>
  );
}

type FormErrors = { current?: string; password?: string; confirmation?: string };

/** Erreurs du serveur affichées sous le formulaire (les autres vont sous leur champ). */
const SERVER_ERRORS: Partial<Record<AdminAuthErrorCode, string>> = {
  weak_password: "Mot de passe refusé : choisis-en un plus long ou moins courant.",
  same_password: "Le nouveau mot de passe doit être différent de l'actuel.",
  too_many_attempts: "Trop de tentatives. Réessaie dans quelques minutes.",
  not_signed_in: "Ta session a expiré : déconnecte-toi, puis reconnecte-toi.",
};
const DEFAULT_ERROR =
  "Le mot de passe n'a pas pu être changé. Vérifie ta connexion, puis réessaie.";

/**
 * Changement de mot de passe : l'ancien est redemandé (on vérifie que c'est bien Alix qui
 * tient le téléphone), 12 caractères minimum, aucune autre règle. Pas de réinitialisation par
 * e-mail : en cas d'oubli, voir docs/ADMIN-COMPTE.md.
 */
function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(undefined);
    setSuccess(undefined);
    const found: FormErrors = {};
    if (current === "") found.current = "Indique ton mot de passe actuel.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      found.password = `${MIN_PASSWORD_LENGTH} caractères minimum.`;
    }
    if (confirmation !== password) found.confirmation = "Les deux mots de passe sont différents.";
    setErrors(found);
    if (found.current || found.password || found.confirmation) return;

    setSubmitting(true);
    try {
      const { otherDevicesSignedOut } = await changePassword(current, password);
      setSuccess(
        otherDevicesSignedOut
          ? "Mot de passe modifié. Tes autres appareils ont été déconnectés."
          : "Mot de passe modifié. Tes autres appareils n'ont pas pu être déconnectés pour le moment.",
      );
      setCurrent("");
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      const code = caught instanceof AdminAuthError ? caught.code : "unknown";
      if (code === "wrong_current_password") {
        setErrors({ current: "Mot de passe actuel incorrect." });
        setCurrent("");
      } else {
        setError(SERVER_ERRORS[code] ?? DEFAULT_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="change-password"
      className="flex flex-col gap-5"
    >
      <h2 id="change-password">Changer mon mot de passe</h2>
      {/* Identifiant invisible : aide le gestionnaire de mots de passe à enregistrer le nouveau
          mot de passe pour le bon compte. */}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <PasswordField
        id="current-password"
        name="current-password"
        autoComplete="current-password"
        label="Mot de passe actuel"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
      />
      <PasswordField
        id="new-password"
        name="new-password"
        autoComplete="new-password"
        label="Nouveau mot de passe"
        hint={`${MIN_PASSWORD_LENGTH} caractères minimum. Une phrase de plusieurs mots convient très bien.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <PasswordField
        id="confirm-password"
        name="confirm-password"
        autoComplete="new-password"
        label="Confirme le nouveau mot de passe"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        error={errors.confirmation}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {success && <SuccessMessage>{success}</SuccessMessage>}
      <Button
        type="submit"
        disabled={submitting}
        aria-busy={submitting || undefined}
        className="w-full sm:w-auto"
      >
        {submitting ? "Enregistrement…" : "Changer le mot de passe"}
      </Button>
    </form>
  );
}
