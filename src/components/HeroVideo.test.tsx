import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroVideo } from "@/components/HeroVideo";

/** Fausse media query `prefers-reduced-motion` (jsdom n'a pas de matchMedia). */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduce,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

/** Simule un onglet caché ou visible (jsdom laisse `document.hidden` à false). */
function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

const play = vi.spyOn(HTMLMediaElement.prototype, "play");
const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");

const SOURCES = [
  { src: "/media/hero.webm", type: "video/webm" },
  { src: "/media/hero.mp4", type: "video/mp4" },
] as const;

function renderHero() {
  return render(<HeroVideo sources={SOURCES} posterSrc="/media/hero.jpg" />);
}

function getVideo() {
  return screen.getByTestId("hero-media").querySelector("video");
}

beforeEach(() => {
  play.mockReset().mockResolvedValue(undefined);
  pause.mockReset().mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTabHidden(false);
});

describe("HeroVideo", () => {
  it("lit la vidéo en boucle, muette, en ligne, sans précharger tout le fichier", () => {
    setReducedMotion(false);
    renderHero();

    const video = getVideo();
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("poster", "/media/hero.jpg");
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    // React pose `muted` comme propriété DOM, pas comme attribut HTML.
    expect(video!.muted).toBe(true);
    expect(play).toHaveBeenCalledOnce();
  });

  it("propose le WebM puis le MP4, dans cet ordre", () => {
    setReducedMotion(false);
    renderHero();

    const sources = [...getVideo()!.querySelectorAll("source")];
    expect(sources.map((source) => source.getAttribute("src"))).toEqual([
      "/media/hero.webm",
      "/media/hero.mp4",
    ]);
    expect(sources.map((source) => source.getAttribute("type"))).toEqual([
      "video/webm",
      "video/mp4",
    ]);
  });

  it("n'affiche pas de vidéo si l'utilisateur réduit les animations : poster seul", () => {
    setReducedMotion(true);
    renderHero();

    expect(getVideo()).toBeNull();
    expect(play).not.toHaveBeenCalled();
    const poster = screen.getByTestId("hero-media").querySelector("img");
    expect(poster).toHaveAttribute("src", "/media/hero.jpg");
    expect(poster).not.toHaveAttribute("loading");
  });

  it("retire la vidéo si la lecture automatique est refusée (économie d'énergie iOS)", async () => {
    setReducedMotion(false);
    play.mockRejectedValue(new DOMException("refusé", "NotAllowedError"));
    renderHero();

    await vi.waitFor(() => expect(getVideo()).toBeNull());
    expect(screen.getByTestId("hero-media").querySelector("img")).not.toBeNull();
  });

  it("retire la vidéo si aucune source ne se charge : poster seul", () => {
    setReducedMotion(false);
    renderHero();

    // Le navigateur signale l'échec sur la dernière source, une fois toutes essayées.
    const sources = getVideo()!.querySelectorAll("source");
    fireEvent.error(sources[sources.length - 1]!);

    expect(getVideo()).toBeNull();
    expect(screen.getByTestId("hero-media").querySelector("img")).not.toBeNull();
  });

  it("met la vidéo en pause quand l'onglet est caché, et la relance au retour", () => {
    setReducedMotion(false);
    renderHero();
    expect(play).toHaveBeenCalledOnce();

    setTabHidden(true);
    expect(pause).toHaveBeenCalledOnce();

    setTabHidden(false);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("n'écoute plus l'onglet une fois le hero retiré de la page", () => {
    setReducedMotion(false);
    const { unmount } = renderHero();
    unmount();

    setTabHidden(true);
    expect(pause).not.toHaveBeenCalled();
  });
});
