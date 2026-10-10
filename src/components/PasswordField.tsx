import { useState, type ComponentProps } from "react";
import { Field } from "@/components/Field";

type PasswordFieldProps = Omit<ComponentProps<typeof Field>, "type" | "suffix"> & {
  /** `current-password` (connexion, ancien mot de passe) ou `new-password` (nouveau). */
  autoComplete: "current-password" | "new-password";
};

/**
 * Champ mot de passe avec bouton « Afficher / Masquer », pour vérifier sa saisie sur un petit
 * clavier de téléphone. Le bouton :
 * - est un vrai `<button type="button">` (ne soumet pas le formulaire), de 44 px de haut ;
 * - indique son état par `aria-pressed` (lu « bouton, enfoncé ») ;
 * - a un nom accessible qui CONTIENT son texte visible (WCAG 2.5.3) : « Afficher le mot de passe ».
 * `autoComplete` est obligatoire : c'est lui qui permet au gestionnaire de mots de passe du
 * téléphone de proposer, ou d'enregistrer, le bon mot de passe.
 */
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      {...props}
      type={visible ? "text" : "password"}
      // Pas de correction ni de majuscule automatique quand le mot de passe est affiché.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          aria-pressed={visible}
          aria-controls={props.id}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          onClick={() => setVisible((shown) => !shown)}
          className="min-h-tap shrink-0 border border-muted bg-surface px-3 text-base font-semibold text-ink"
        >
          {visible ? "Masquer" : "Afficher"}
        </button>
      }
    />
  );
}
