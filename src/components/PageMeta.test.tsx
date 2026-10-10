import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageMeta } from "@/components/PageMeta";

/** React 19 déplace les <meta> rendus dans l'arbre vers le <head> du document. */
const metaContent = (name: string) =>
  document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? null;

describe("PageMeta", () => {
  it("ajoute le titre du site et la description, sans noindex ni no-referrer par défaut", () => {
    render(<PageMeta title="Réserver" description="Réserve ton créneau." />);

    expect(document.title).toBe("Réserver · CutsByAlix");
    expect(metaContent("description")).toBe("Réserve ton créneau.");
    expect(metaContent("robots")).toBeNull();
    expect(metaContent("referrer")).toBeNull();
  });

  it("ajoute noindex et no-referrer à la demande", () => {
    render(<PageMeta title="Annuler" description="Annulation." noindex noReferrer />);

    expect(metaContent("robots")).toBe("noindex");
    expect(metaContent("referrer")).toBe("no-referrer");
  });

  it("retire noindex et no-referrer quand la page est démontée", () => {
    const { unmount } = render(<PageMeta description="Annulation." noindex noReferrer />);
    unmount();

    expect(metaContent("robots")).toBeNull();
    expect(metaContent("referrer")).toBeNull();
  });
});
