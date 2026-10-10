import { Route, Routes } from "react-router";
import { Layout } from "@/components/Layout";
import { AdminAccountPage } from "@/pages/admin/AdminAccountPage";
import { AdminAvailabilitiesPage } from "@/pages/admin/AdminAvailabilitiesPage";
import { AdminBookingsPage } from "@/pages/admin/AdminBookingsPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { AdminGalleryPage } from "@/pages/admin/AdminGalleryPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { BookingPage } from "@/pages/BookingPage";
import { CancelPage } from "@/pages/CancelPage";
import { HomePage } from "@/pages/HomePage";
import { LegalNoticePage } from "@/pages/LegalNoticePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";

/**
 * Table des routes de l'application.
 * La route parente porte le gabarit ; les routes enfants s'affichent dans son `<Outlet />`.
 * Prestations et galerie ne sont pas des routes : ce sont des sections de l'accueil.
 * `path="*"` est la route attrape-tout (404) : elle ne joue que si aucune autre ne correspond.
 *
 * L'admin a son propre gabarit (garde de session, navigation en bas d'écran), sans en-tête ni
 * pied de page publics. La connexion est hors du gabarit : elle reste accessible sans session.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="reserver" element={<BookingPage />} />
        <Route path="annuler" element={<CancelPage />} />
        <Route path="mentions-legales" element={<LegalNoticePage />} />
        <Route path="politique-confidentialite" element={<PrivacyPolicyPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="admin/connexion" element={<AdminLoginPage />} />
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="rendez-vous" element={<AdminBookingsPage />} />
        <Route path="disponibilites" element={<AdminAvailabilitiesPage />} />
        <Route path="galerie" element={<AdminGalleryPage />} />
        <Route path="compte" element={<AdminAccountPage />} />
      </Route>
    </Routes>
  );
}
