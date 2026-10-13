import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";

type ChoiceProps = Omit<ComponentProps<"input">, "className" | "children"> & {
  type: "radio" | "checkbox";
  children: ReactNode;
  className?: string;
};

/**
 * Option à cocher (radio ou case) : tout le libellé est cliquable et fait au moins 44 px.
 * `has-checked:` (sélecteur CSS :has) met en évidence l'option cochée, sans JavaScript.
 * À utiliser sur fond clair.
 */
export function Choice({ children, className, ...inputProps }: ChoiceProps) {
  return (
    <label
      className={cx(
        "flex min-h-tap cursor-pointer items-center gap-3 border border-ink/20 bg-surface px-4 py-3 text-ink has-checked:border-ink has-checked:shadow-[inset_4px_0_0_var(--color-orange)]",
        className,
      )}
    >
      <input className="size-5 shrink-0 accent-ink" {...inputProps} />
      <span className="flex min-w-0 flex-1 flex-col">{children}</span>
    </label>
  );
}
