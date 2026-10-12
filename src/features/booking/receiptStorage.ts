import { parseISO } from "date-fns";
import type { BookingReceipt } from "@/features/booking/data";
import { storedReceiptSchema } from "@/lib/schemas";

/**
 * Récapitulatif de la dernière réservation, gardé le temps de l'ONGLET (C-03 de l'audit) : un
 * rechargement de la confirmation ne fait plus perdre le lien d'annulation.
 *
 * - `sessionStorage` : propre à l'onglet, effacé à sa fermeture, jamais envoyé à un serveur
 *   (comparable à une session PHP, mais côté navigateur et pour cet onglet seulement).
 * - Contenu : date, heures, prestation, localité et jeton. AUCUNE donnée personnelle.
 * - Le jeton y est lisible par un script de la page, comme il l'est déjà dans le DOM de la
 *   confirmation : le risque est le même, traité par la CSP (K-01).
 * - Tout accès est protégé (try/catch) : navigation privée stricte, quota plein ou stockage
 *   désactivé = le site marche comme avant, seul le rechargement de la confirmation est perdu.
 */
const STORAGE_KEY = "cutsbyalix:booking-receipt";

export function saveReceipt(receipt: BookingReceipt): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(receipt));
  } catch {
    // Stockage indisponible : rien à faire, la confirmation reste affichée en mémoire.
  }
}

/**
 * Récapitulatif encore utile (RDV pas terminé), ou `null`. Un contenu illisible, modifié ou
 * expiré est effacé.
 */
export function loadReceipt(now: Date): BookingReceipt | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = storedReceiptSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parseISO(parsed.data.endsAt) > now) return parsed.data;
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    clearReceipt();
    return null;
  }
}

export function clearReceipt(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible : il n'y a rien à effacer.
  }
}
