import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LegalNoticePage } from "@/pages/LegalNoticePage";
import { PrivacyPolicyPage } from "@/pages/PrivacyPolicyPage";

/**
 * Pages légales : toutes les rubriques attendues sont présentes, et les informations
 * personnelles restent des marqueurs « À COMPLÉTER » visibles (rien d'inventé).
 */
function renderPage(page: ReactNode) {
  render(<MemoryRouter>{page}</MemoryRouter>);
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

describe("mentions légales", () => {
  it("contient les rubriques de la LCEN et des marqueurs à compléter", () => {
    expect(renderPage(<LegalNoticePage />)).toEqual([
      "Éditeur du site",
      "Directeur de la publication",
      "Hébergement",
      "Conception et réalisation",
      "Propriété intellectuelle",
      "Données personnelles",
      "Contact",
    ]);
    expect(screen.getByText(/Cloudflare, Inc\./)).toBeInTheDocument();
    expect(screen.getByText(/nom et prénom d'Alix/)).toHaveTextContent(/^\[À COMPLÉTER : /);
    expect(screen.getByRole("link", { name: "politique de confidentialité" })).toHaveAttribute(
      "href",
      "/politique-confidentialite",
    );
  });
});

describe("politique de confidentialité", () => {
  it("contient les rubriques du RGPD, la durée et les règles réelles du site", () => {
    expect(renderPage(<PrivacyPolicyPage />)).toEqual([
      "Responsable du traitement",
      "Données collectées",
      "Finalités et base légale",
      "Durée de conservation",
      "Destinataires et sous-traitants",
      "Tes droits",
      "Cookies et stockage local",
      "Contact",
    ]);
    expect(screen.getByText(/supprimées 6 mois après la date du rendez-vous/)).toBeInTheDocument();
    expect(screen.getByText(/au plus 2 rendez-vous à venir/)).toBeInTheDocument();
    expect(screen.getByText(/n'utilise aucun cookie/)).toBeInTheDocument();
    expect(screen.getAllByText(/^\[À COMPLÉTER : /).length).toBeGreaterThan(0);
  });
});
