/**
 * Validation SIMPLE des coordonnées, côté écran, pour guider le client avant l'envoi.
 * La vraie validation est faite par la base (create_booking) : ces règles en sont une copie
 * et seront remplacées par un schéma Zod partagé au branchement (src/lib/schemas.ts).
 */

export type ContactForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  consent: boolean;
};

export type ContactErrors = Partial<Record<keyof ContactForm, string>>;

/**
 * Caractères refusés par `private.is_safe_text` : contrôle, balisage (< > ") et caractères
 * invisibles ou d'inversion de sens. Le signe = est aussi refusé dans les noms.
 */
const UNSAFE_TEXT = /[\p{Cc}<>"\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/u;
const PHONE_PATTERN = /^(0[1-9][0-9]{8}|\+[1-9][0-9]{7,14})$/;
const EMAIL_PATTERN = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;

/**
 * Même normalisation que create_booking : on retire espaces, points, tirets, parenthèses et
 * barres ; 00 devient + ; +33 6… devient 06… Renvoie null si le champ est vide.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s.()/-]/g, "");
  if (compact === "") return null;
  return compact.replace(/^00/, "+").replace(/^\+33([1-9][0-9]{8})$/, "0$1");
}

export function isValidPhone(normalized: string): boolean {
  return PHONE_PATTERN.test(normalized) && !normalized.startsWith("+33");
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return email === "" ? null : email;
}

export function isValidEmail(normalized: string): boolean {
  return (
    normalized.length <= 254 && !UNSAFE_TEXT.test(normalized) && EMAIL_PATTERN.test(normalized)
  );
}

export function isValidName(raw: string): boolean {
  const name = raw.trim();
  return name.length >= 1 && name.length <= 50 && !UNSAFE_TEXT.test(name) && !name.includes("=");
}

function nameError(raw: string, missing: string): string | undefined {
  if (raw.trim() === "") return missing;
  if (raw.trim().length > 50) return "50 caractères maximum.";
  if (!isValidName(raw)) return 'Évite les caractères < > " et =.';
  return undefined;
}

/**
 * Ce que la base verra des coordonnées, après le même nettoyage qu'elle fait (espaces au bord,
 * séparateurs du téléphone, casse de l'e-mail). Deux formulaires de même empreinte envoient la
 * même réservation : la clé d'idempotence (ADR 0009) n'a pas besoin de changer. Le consentement
 * et le honeypot ne partent pas dans la réservation.
 */
export function contactFingerprint(form: ContactForm): string {
  return JSON.stringify([
    form.firstName.trim(),
    form.lastName.trim(),
    normalizePhone(form.phone),
    normalizeEmail(form.email),
  ]);
}

/** Erreurs à afficher sous chaque champ ; objet vide si tout est bon. */
export function validateContact(form: ContactForm): ContactErrors {
  const errors: ContactErrors = {};
  const firstName = nameError(form.firstName, "Indique ton prénom.");
  const lastName = nameError(form.lastName, "Indique ton nom.");
  if (firstName) errors.firstName = firstName;
  if (lastName) errors.lastName = lastName;

  const phone = normalizePhone(form.phone);
  const email = normalizeEmail(form.email);
  if (phone === null && email === null) {
    errors.phone = "Laisse au moins un téléphone ou un email.";
  }
  if (phone !== null && !isValidPhone(phone)) {
    errors.phone = "Ce numéro ne semble pas valide. Exemple : 06 12 34 56 78.";
  }
  if (email !== null && !isValidEmail(email)) {
    errors.email = "Cet email ne semble pas valide. Exemple : prenom@exemple.fr.";
  }

  if (!form.consent) errors.consent = "Coche la case pour pouvoir réserver.";
  return errors;
}
