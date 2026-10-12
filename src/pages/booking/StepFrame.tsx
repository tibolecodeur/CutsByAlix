import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { cx } from "@/lib/cx";

export const STEP_COUNT = 4;

type StepFrameProps = {
  /** Numéro de l'étape (1 à 4) ; absent pour l'écran de confirmation. */
  number?: number;
  title: string;
  /** Place le focus sur le titre à l'affichage (après un changement d'étape). */
  focusOnMount: boolean;
  children: ReactNode;
};

/**
 * Cadre commun aux étapes : progression, titre, contenu.
 *
 * Le parent le rend avec `key={étape}` : à chaque étape, React démonte l'ancien cadre et
 * en monte un nouveau, ce qui relance l'effet ci-dessous. Le focus va sur le titre (rendu
 * focalisable par `tabIndex={-1}`) : le lecteur d'écran annonce la nouvelle étape et le
 * clavier repart du haut, au lieu de rester sur un bouton qui a disparu.
 */
export function StepFrame({ number, title, focusOnMount, children }: StepFrameProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // useLayoutEffect et non useEffect : le focus est placé dans la MÊME tâche que l'insertion de
  // l'étape, avant qu'un champ soit utilisable. Les changements d'étape passent par le routeur,
  // qui les applique en « transition » : un useEffect s'exécuterait ~30 ms après l'affichage, et
  // volerait le focus à un champ que le client (ou le remplissage automatique de l'iPhone) vient
  // de toucher, le texte saisi partant alors dans le vide (constaté en e2e sous WebKit).
  useLayoutEffect(() => {
    if (focusOnMount) titleRef.current?.focus();
  }, [focusOnMount]);

  return (
    <section aria-labelledby="booking-step-title" className="flex flex-col gap-6">
      {number !== undefined && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted">
            Étape {number} sur {STEP_COUNT}
          </p>
          {/* Barre de progression décorative : le texte au-dessus porte l'information. */}
          <div aria-hidden="true" className="grid grid-cols-4 gap-1">
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <span key={index} className={cx("h-1.5", index < number ? "bg-ink" : "bg-ink/15")} />
            ))}
          </div>
        </div>
      )}
      <h2 id="booking-step-title" ref={titleRef} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </section>
  );
}

type StepActionsProps = {
  onBack?: () => void;
  submitLabel: string;
  submitting?: boolean;
  /** Retire « Continuer » : l'étape n'a rien à valider (ex. aucun jour disponible). */
  hideSubmit?: boolean;
};

/**
 * Boutons de bas d'étape. Sur mobile, empilés, l'action principale en dernier : c'est la
 * plus proche du pouce. « Continuer » est un bouton `submit` : la touche Entrée du clavier
 * virtuel valide aussi l'étape.
 */
export function StepActions({
  onBack,
  submitLabel,
  submitting = false,
  hideSubmit = false,
}: StepActionsProps) {
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
      {onBack ? (
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          Retour
        </Button>
      ) : (
        // Garde « Continuer » à droite sur desktop ; inutile (et espace perdu) sur mobile.
        <span className="hidden sm:block" />
      )}
      {!hideSubmit && (
        <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
          {submitLabel}
        </Button>
      )}
    </div>
  );
}

/** Erreur d'un groupe de choix (fieldset), reliée au groupe par son id. */
export function GroupError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-bold text-accent">
      {message}
    </p>
  );
}
