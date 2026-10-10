import { useOutletContext } from "react-router";
import type { AdminSession } from "@/features/admin/auth";

/** Ce que le gabarit admin transmet à ses pages, via `<Outlet context={…} />`. */
export type AdminContext = {
  session: AdminSession;
  /** Déconnecte ce navigateur, puis renvoie vers la connexion. */
  onSignOut: () => Promise<void>;
};

/**
 * Session et déconnexion, pour une page rendue dans le gabarit admin.
 * `useOutletContext` lit la valeur passée par le parent à son `<Outlet />` : pas besoin de
 * créer un Context React pour un seul niveau d'imbrication.
 */
export function useAdmin(): AdminContext {
  return useOutletContext<AdminContext>();
}
