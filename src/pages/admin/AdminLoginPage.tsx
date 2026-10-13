import { useState, type SubmitEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { PageMeta } from "@/components/PageMeta";
import { PasswordField } from "@/components/PasswordField";
import { Section } from "@/components/Section";
import { ErrorMessage } from "@/components/StatusMessage";
import { AdminAuthError, getAdminSession, signIn } from "@/features/admin/auth";
import { useAsync } from "@/lib/useAsync";
import { AdminHead } from "@/pages/admin/AdminHead";

/**
 * Message unique pour toute erreur d'identification : on ne dit jamais si c'est l'e-mail ou le
 * mot de passe qui est faux, ni si le compte existe.
 */
const INVALID_CREDENTIALS = "E-mail ou mot de passe incorrect.";
const TOO_MANY_ATTEMPTS = "Trop de tentatives. Réessaie dans quelques minutes.";
const UNAVAILABLE =
  "Connexion impossible pour le moment. Vérifie ta connexion internet, puis réessaie.";

/**
 * Page demandée avant la redirection vers la connexion (`state.from`), si c'est bien une page
 * de l'admin. Tout le reste (autre site, chemin bizarre) ramène au tableau de bord.
 */
function redirectTarget(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && /^\/admin(\/[\w-]*)*$/.test(from) ? from : "/admin";
}

/** Connexion à l'espace admin (`/admin/connexion`) : e-mail + mot de passe, compte unique. */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Déjà connecté (session gardée sur ce téléphone) : direction l'admin.
  const existing = useAsync("admin-session-login", getAdminSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  if (existing.status === "success" && existing.data !== null) {
    return <Navigate to={redirectTarget(location.state)} replace />;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (email.trim() === "" || password === "") {
      setError("Indique ton e-mail et ton mot de passe.");
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await signIn(email, password);
      navigate(redirectTarget(location.state), { replace: true });
    } catch (caught) {
      const code = caught instanceof AdminAuthError ? caught.code : "unknown";
      setError(
        code === "invalid_credentials"
          ? INVALID_CREDENTIALS
          : code === "too_many_attempts"
            ? TOO_MANY_ATTEMPTS
            : UNAVAILABLE,
      );
      setPassword("");
      setSubmitting(false);
    }
  }

  return (
    <main id="contenu" tabIndex={-1} className="min-h-dvh pt-[env(safe-area-inset-top)]">
      <AdminHead />
      <PageMeta title="Espace admin" description="Connexion à l'espace d'administration." />
      <Section>
        <h1>Espace admin</h1>
      </Section>
      <Section>
        <Card className="mx-auto w-full max-w-md">
          <form
            onSubmit={handleSubmit}
            method="post"
            noValidate
            aria-labelledby="admin-login"
            className="flex flex-col gap-5"
          >
            <h2 id="admin-login" className="text-3xl">
              Connexion
            </h2>
            <Field
              id="admin-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              label="E-mail"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField
              id="admin-password"
              name="password"
              autoComplete="current-password"
              label="Mot de passe"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Button
              type="submit"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="w-full"
            >
              {submitting ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
        </Card>
      </Section>
    </main>
  );
}
