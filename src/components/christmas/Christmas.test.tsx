import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Snowfall } from "@/components/christmas/Snowfall";
import { Layout } from "@/components/Layout";

// jsdom ne fait pas défiler la page : on neutralise les appels de useScrollToHash.
beforeAll(() => {
  window.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Simule le réglage « réduire les animations » du téléphone. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderLayoutOn(isoDate: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoDate));
  return render(
    <MemoryRouter initialEntries={["/reserver"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="reserver" element={<h1>Réserver</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Décorations de Noël dans le gabarit public", () => {
  it("en décembre : guirlande et neige, décoratives (aria-hidden)", () => {
    renderLayoutOn("2026-12-15T10:00:00+01:00");
    expect(screen.getByTestId("christmas-garland")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("snowfall")).toHaveAttribute("aria-hidden", "true");
    // Rien de focusable, rien d'annoncé : le titre de la page reste le premier contenu.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Réserver");
  });

  it("en novembre : aucune décoration", () => {
    renderLayoutOn("2026-11-25T10:00:00+01:00");
    expect(screen.queryByTestId("christmas-garland")).not.toBeInTheDocument();
    expect(screen.queryByTestId("snowfall")).not.toBeInTheDocument();
  });

  it("animations réduites : guirlande gardée (fixe), pas de neige", () => {
    stubReducedMotion(true);
    renderLayoutOn("2026-12-15T10:00:00+01:00");
    expect(screen.getByTestId("christmas-garland")).toBeInTheDocument();
    expect(screen.queryByTestId("snowfall")).not.toBeInTheDocument();
  });
});

describe("Snowfall", () => {
  it("56 flocons, dont 26 masqués sur mobile ; ne capte ni clic ni doigt", () => {
    stubReducedMotion(false);
    render(<Snowfall />);
    const layer = screen.getByTestId("snowfall");
    expect(layer).toHaveClass("pointer-events-none");
    const flakes = layer.querySelectorAll(".snowflake");
    expect(flakes).toHaveLength(56);
    expect(layer.querySelectorAll(".snowflake.hidden")).toHaveLength(26);
  });
});
