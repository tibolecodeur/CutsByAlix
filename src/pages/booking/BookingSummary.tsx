import type { ReactNode } from "react";

/**
 * Liste « libellé : valeur » du récapitulatif. `<dl>` (liste de définitions) est la balise
 * prévue pour ces paires : les lecteurs d'écran les annoncent ensemble.
 */
export function BookingSummary({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="flex flex-col overflow-hidden rounded-panel border border-ink/15 bg-surface">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex flex-col gap-0.5 border-b border-ink/10 px-4 py-3 last:border-b-0"
        >
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="font-semibold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
