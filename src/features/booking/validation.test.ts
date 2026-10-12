import { describe, expect, it } from "vitest";
import {
  contactFingerprint,
  isValidEmail,
  isValidName,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validateContact,
  type ContactForm,
} from "@/features/booking/validation";

const VALID: ContactForm = {
  firstName: "Lucas",
  lastName: "Martin",
  phone: "06 39 98 00 02",
  email: "",
  consent: true,
};

describe("normalizePhone (copie de create_booking)", () => {
  it("retire les séparateurs et convertit +33 et 0033 en 0", () => {
    expect(normalizePhone("06 39.98-00 02")).toBe("0639980002");
    expect(normalizePhone("+33 6 39 98 00 02")).toBe("0639980002");
    expect(normalizePhone("0033639980002")).toBe("0639980002");
    expect(normalizePhone("+32 470 12 34 56")).toBe("+32470123456");
    expect(normalizePhone("   ")).toBeNull();
  });

  it("accepte un numéro français ou international, refuse le reste", () => {
    expect(isValidPhone("0639980002")).toBe(true);
    expect(isValidPhone("+32470123456")).toBe(true);
    expect(isValidPhone("063998000")).toBe(false);
    expect(isValidPhone("+0639980002")).toBe(false);
    expect(isValidPhone("+33612345")).toBe(false);
  });
});

describe("email et noms", () => {
  it("normalise et valide l'email", () => {
    expect(normalizeEmail("  Zoe@Exemple.FR ")).toBe("zoe@exemple.fr");
    expect(normalizeEmail("")).toBeNull();
    expect(isValidEmail("zoe@exemple.fr")).toBe(true);
    expect(isValidEmail("zoe@exemple")).toBe(false);
    expect(isValidEmail('zo"e@exemple.fr')).toBe(false);
  });

  it("refuse balisage, signe = et caractères invisibles dans les noms", () => {
    expect(isValidName("Jean-Étienne")).toBe(true);
    expect(isValidName("<b>Jean</b>")).toBe(false);
    expect(isValidName("=SOMME(A1)")).toBe(false);
    expect(isValidName("Je\u200Ban")).toBe(false);
    expect(isValidName("x".repeat(51))).toBe(false);
  });
});

describe("validateContact", () => {
  it("ne renvoie aucune erreur pour un formulaire complet", () => {
    expect(validateContact(VALID)).toEqual({});
    expect(validateContact({ ...VALID, phone: "", email: "zoe@exemple.fr" })).toEqual({});
  });

  it("signale chaque champ manquant, au tutoiement", () => {
    expect(
      validateContact({ firstName: " ", lastName: "", phone: "", email: "", consent: false }),
    ).toEqual({
      firstName: "Indique ton prénom.",
      lastName: "Indique ton nom.",
      phone: "Laisse au moins un téléphone ou un email.",
      consent: "Coche la case pour pouvoir réserver.",
    });
  });

  it("signale un téléphone, un email ou un nom invalides", () => {
    const errors = validateContact({
      ...VALID,
      firstName: "x".repeat(51),
      lastName: "a=b",
      phone: "123",
      email: "pas-un-email",
    });
    expect(errors.firstName).toBe("50 caractères maximum.");
    expect(errors.lastName).toMatch(/Évite/);
    expect(errors.phone).toMatch(/numéro/);
    expect(errors.email).toMatch(/email/);
  });
});

describe("contactFingerprint (clé d'idempotence, ADR 0009)", () => {
  it("ne change pas quand seule la mise en forme change (espaces, séparateurs, casse)", () => {
    const base = { ...VALID, firstName: "Zoé", phone: "06 39 98 00 10", email: "Zoe@Example.test" };
    const same = contactFingerprint(base);
    expect(contactFingerprint({ ...base, firstName: " Zoé " })).toBe(same);
    expect(contactFingerprint({ ...base, phone: "06.39.98.00.10" })).toBe(same);
    expect(contactFingerprint({ ...base, phone: "+33 6 39 98 00 10" })).toBe(same);
    expect(contactFingerprint({ ...base, email: " zoe@example.test " })).toBe(same);
  });

  it("ne dépend ni du consentement ni d'un champ resté vide", () => {
    expect(contactFingerprint({ ...VALID, consent: false })).toBe(contactFingerprint(VALID));
    expect(contactFingerprint({ ...VALID, email: "   " })).toBe(contactFingerprint(VALID));
  });

  it("change dès qu'une valeur envoyée à la base change", () => {
    const same = contactFingerprint(VALID);
    expect(contactFingerprint({ ...VALID, firstName: "Luca" })).not.toBe(same);
    expect(contactFingerprint({ ...VALID, lastName: "Martins" })).not.toBe(same);
    expect(contactFingerprint({ ...VALID, phone: "06 39 98 00 03" })).not.toBe(same);
    expect(contactFingerprint({ ...VALID, email: "lucas@example.test" })).not.toBe(same);
  });
});
