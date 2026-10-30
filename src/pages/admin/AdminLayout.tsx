import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import { useScrollToHash } from "@/components/useScrollToHash";
import { getAdminSession, onAdminSignedOut, signOut } from "@/features/admin/auth";
import { forgetThisPushDevice } from "@/features/admin/push";
import { useAsync } from "@/lib/useAsync";
import { AdminHead } from "@/pages/admin/AdminHead";
import type { AdminContext } from "@/pages/admin/useAdmin";

const NAV_LINKS = [
  { to: "/admin", label: "Accueil", end: true },
  { to: "/admin/rendez-vous", label: "RDV", end: false },
  { to: "/admin/disponibilites", label: "Dispos", end: false },
  { to: "/admin/galerie", label: "Galerie", end: false },
  { to: "/admin/compte", label: "Compte", end: false },
] as const;

/**
 * Gabarit de l'espace admin (`/admin/*`), distinct de celui du site public : aucun lien
 * vers lui depuis le site.
 *
 * Il joue le rôle du pare-feu de Symfony (`access_control`) : tant que la session n'est pas
 * vérifiée (session gardée ET ligne dans `admins`), AUCUNE page admin n'est montée, donc
 * aucune donnée n'est chargée. Sans session valide : redirection vers `/admin/connexion`, en
 * retenant la page demandée. Ce n'est qu'un confort d'affichage : la vraie protection des
 * données, c'est la RLS de Supabase (un non-admin ne lit rien, même en appelant l'API à la main).
 *
 * Mobile : barre de navigation fixée en bas, à portée de pouce, au-dessus de la barre
 * d'accueil iOS (`env(safe-area-inset-bottom)`). Desktop : dans l'en-tête.
 */
export function AdminLayout() {
  // Comme le site public : retour en haut de page à chaque navigation.
  useScrollToHash();
  const location = useLocation();
  const navigate = useNavigate();
  const sessionState = useAsync("admin-session", getAdminSession);
  const [signedOut, setSignedOut] = useState(false);

  // Session perdue pendant l'utilisation (jeton révoqué, déconnexion dans un autre onglet) :
  // `useEffect` s'abonne au montage et se désabonne au démontage (la fonction renvoyée).
  useEffect(() => onAdminSignedOut(() => setSignedOut(true)), []);

  async function handleSignOut() {
    // Ce téléphone ne reçoit plus les notifications (prénoms des clients) une fois déconnecté.
    await forgetThisPushDevice();
    await signOut();
    navigate("/admin/connexion", { replace: true });
  }

  if (signedOut) return <Navigate to="/admin/connexion" replace />;

  if (sessionState.status === "loading" || sessionState.status === "idle") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-safe">
        <AdminHead />
        <LoadingMessage>Chargement…</LoadingMessage>
      </main>
    );
  }

  if (sessionState.status === "error") {
    // Réseau coupé : on ne déconnecte pas, on propose de réessayer.
    return (
      <main className="flex min-h-dvh items-center justify-center px-safe">
        <AdminHead />
        <ErrorMessage onRetry={sessionState.reload}>
          Impossible de vérifier ta connexion pour le moment. Vérifie ta connexion internet, puis
          réessaie.
        </ErrorMessage>
      </main>
    );
  }

  const session = sessionState.data;
  if (session === null) {
    return <Navigate to="/admin/connexion" replace state={{ from: location.pathname }} />;
  }

  const context: AdminContext = { session, onSignOut: handleSignOut };
  return (
    <div className="flex min-h-dvh flex-col">
      <AdminHead />
      <a
        href="#contenu"
        className="sr-only z-50 bg-surface px-4 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-[env(safe-area-inset-top)] focus:left-2 focus:inline-flex focus:min-h-tap focus:items-center"
      >
        Aller au contenu
      </a>
      <header className="border-b border-ink/10 bg-surface pt-[env(safe-area-inset-top)] text-ink">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-safe">
          <Link
            to="/admin"
            className="title-display inline-flex min-h-header items-center text-2xl uppercase"
          >
            CutsByAlix <span className="ml-2 text-base not-italic">admin</span>
          </Link>
          <nav
            aria-label="Navigation admin"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/15 bg-surface pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:pb-0"
          >
            <ul className="grid grid-cols-5 px-[env(safe-area-inset-left)] md:flex md:gap-6 md:px-0">
              {NAV_LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className="flex min-h-[3.5rem] items-center justify-center border-t-4 border-transparent text-sm font-semibold aria-[current=page]:border-orange aria-[current=page]:font-bold md:min-h-tap md:border-t-0 md:border-b-4 md:text-base"
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      {/* Marge basse sur mobile : le contenu ne finit pas caché sous la barre de navigation. */}
      <main
        id="contenu"
        tabIndex={-1}
        className="w-full flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <Outlet context={context} />
      </main>
    </div>
  );
}
