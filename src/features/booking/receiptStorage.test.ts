import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearReceipt, loadReceipt, saveReceipt } from "@/features/booking/receiptStorage";

const KEY = "cutsbyalix:booking-receipt";
const RECEIPT = {
  startsAt: "2030-01-15T13:00:00.000Z",
  endsAt: "2030-01-15T14:00:00.000Z",
  serviceName: "Coupe",
  locationLabel: "Les Ponts-de-Cé",
  cancelToken: "7f1c2a9e-3b4d-4e5f-8a6b-9c0d1e2f3a4b",
};
const BEFORE_END = new Date("2030-01-15T13:30:00.000Z");
const AFTER_END = new Date("2030-01-15T14:00:01.000Z");

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("récapitulatif gardé le temps de l'onglet (C-03)", () => {
  it("enregistre puis relit le récapitulatif tel quel", () => {
    saveReceipt(RECEIPT);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(RECEIPT);
    expect(loadReceipt(BEFORE_END)).toEqual(RECEIPT);
  });

  it("rien d'enregistré : null", () => {
    expect(loadReceipt(BEFORE_END)).toBeNull();
  });

  it("RDV terminé : null, et le récapitulatif est effacé", () => {
    saveReceipt(RECEIPT);
    expect(loadReceipt(AFTER_END)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it.each([
    ["illisible", "{pas du json"],
    ["d'une autre forme", JSON.stringify({ unexpected: true })],
    ["avec un jeton modifié", JSON.stringify({ ...RECEIPT, cancelToken: "abc" })],
    ["avec une donnée personnelle en plus", JSON.stringify({ ...RECEIPT, phone: "0639980010" })],
  ])("contenu %s : null, et il est effacé", (_label, raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(loadReceipt(BEFORE_END)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("efface le récapitulatif à la demande", () => {
    saveReceipt(RECEIPT);
    clearReceipt();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it("stockage indisponible (navigation privée stricte, quota) : aucune exception", () => {
    for (const method of ["setItem", "getItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Stockage refusé", "SecurityError");
      });
    }
    expect(() => saveReceipt(RECEIPT)).not.toThrow();
    expect(loadReceipt(BEFORE_END)).toBeNull();
    expect(() => clearReceipt()).not.toThrow();
  });
});
