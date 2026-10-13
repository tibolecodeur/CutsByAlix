import type { ReactNode } from "react";
import { Button } from "@/components/Button";

/**
 * Messages d'état d'un chargement. Les zones `role="status"` et `role="alert"` sont lues
 * automatiquement par les lecteurs d'écran quand leur contenu apparaît (zones aria-live).
 * À utiliser sur fond clair.
 */

export function LoadingMessage({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-muted">
      {children}
    </p>
  );
}

export function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-field border border-ink/15 bg-surface p-4"
    >
      {children}
    </div>
  );
}

type ErrorMessageProps = {
  children: ReactNode;
  /** Affiche un bouton « Réessayer » qui appelle cette fonction. */
  onRetry?: () => void;
};

/** Erreur : bordure et texte d'accent en gras (5,87 sur blanc, 4,56 sur rose pâle). */
export function ErrorMessage({ children, onRetry }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-field border-2 border-accent bg-surface p-4"
    >
      <p className="font-bold text-accent">{children}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** Confirmation d'une action réussie. */
export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-field border-2 border-ink bg-blush p-4 font-semibold text-ink"
    >
      {children}
    </p>
  );
}
