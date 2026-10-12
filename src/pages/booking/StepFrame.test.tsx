import { render, screen } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { describe, expect, it } from "vitest";
import { StepFrame } from "@/pages/booking/StepFrame";

/**
 * Relève l'élément qui a le focus pendant la phase de mise en page (« layout »), c'est-à-dire
 * dans la même tâche que l'insertion du DOM et AVANT les effets ordinaires (`useEffect`).
 * Placé APRÈS le cadre dans l'arbre, il s'exécute après l'effet de mise en page du cadre.
 */
function FocusProbe({ onProbe }: { onProbe: (active: Element | null) => void }) {
  useLayoutEffect(() => {
    onProbe(document.activeElement);
  }, [onProbe]);
  return null;
}

describe("StepFrame : focus sur le titre à l'affichage d'une étape", () => {
  it("place le focus sur le titre dès la phase de mise en page, pas dans un effet différé", () => {
    // Le routeur applique les changements d'étape en « transition » : un useEffect s'exécuterait
    // une trentaine de millisecondes après l'affichage, et volerait le focus à un champ que le
    // client vient de toucher (saisie perdue sous WebKit, constatée en e2e).
    let activeAtLayout: Element | null = null;
    render(
      <>
        <StepFrame number={3} title="Tes coordonnées" focusOnMount>
          <input aria-label="Prénom" />
        </StepFrame>
        <FocusProbe onProbe={(active) => (activeAtLayout = active)} />
      </>,
    );
    const title = screen.getByRole("heading", { level: 2, name: "Tes coordonnées" });
    expect(activeAtLayout).toBe(title);
    expect(title).toHaveFocus();
  });

  it("ne déplace pas le focus au premier affichage de la page (focusOnMount faux)", () => {
    render(
      <StepFrame number={1} title="Quelle prestation ?" focusOnMount={false}>
        <input aria-label="Prénom" />
      </StepFrame>,
    );
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveFocus();
  });
});
