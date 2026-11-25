import { useState } from "react";
import { isChristmasSeason } from "@/features/seasonal/christmas";

/**
 * Vrai pendant la période de Noël. La date est lue UNE fois, au premier rendu : l'initialiseur
 * de `useState` (la fonction passée en argument) ne tourne qu'au montage du composant, comme
 * un champ initialisé dans un constructeur Java. Les décorations ne clignotent donc pas si la
 * page reste ouverte à minuit le 6 janvier ; elles disparaissent à la visite suivante.
 */
export function useChristmasSeason(): boolean {
  const [isChristmas] = useState(() => isChristmasSeason(new Date()));
  return isChristmas;
}
