import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as booking from "@/features/booking/data";
import * as gallery from "@/features/gallery/data";
import { HomePage } from "@/pages/HomePage";

/**
 * Accueil en version de Noël (ADR 0013). La version de base est couverte par HomePage.test.tsx
 * (les tests tournent avec VITE_SEASON=base). jsdom ne dessine pas : getContext renvoie null,
 * la neige se monte sans rien animer.
 */
vi.mock("@/lib/season", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/season")>()),
  CURRENT_SEASON: "noel",
}));
vi.mock("@/features/booking/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/booking/data")>()),
  getServices: vi.fn(),
}));
vi.mock("@/features/gallery/data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gallery/data")>()),
  getPublishedGallery: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.mocked(booking.getServices).mockResolvedValue([]);
  vi.mocked(gallery.getPublishedGallery).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomePage, version de Noël", () => {
  it("neige de ciseaux dans le hero, cachée aux lecteurs d'écran, sans changer le titre", async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    const hero = screen.getByRole("region", { name: "CutsByAlix" });
    const snow = await within(hero).findByTestId("noel-scissor-snow");
    expect(snow).toHaveAttribute("aria-hidden", "true");
    expect(snow.querySelector("canvas")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName("CutsByAlix");
  });
});
