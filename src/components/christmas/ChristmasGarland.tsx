/** Couleurs d'une guirlande classique (exception saisonnière à la palette, docs/DESIGN.md). */
const BULB_CLASSES = ["bulb-red", "bulb-green", "bulb-gold"] as const;
/** Assez d'ampoules pour un écran très large ; le surplus est coupé (overflow hidden). */
const BULB_COUNT = 60;

/**
 * Guirlande de Noël sous l'en-tête : un fil et des ampoules rouges, vertes et or qui
 * scintillent (opacité seulement, index.css `bulb-twinkle` ; fixes si l'utilisateur a demandé
 * moins d'animations). Décorative, elle ne capte ni les clics ni le doigt.
 */
export function ChristmasGarland() {
  return (
    <div
      aria-hidden="true"
      data-testid="christmas-garland"
      className="pointer-events-none absolute inset-x-0 top-full h-5 overflow-hidden"
    >
      <div className="garland-wire" />
      <div className="flex justify-between gap-5 px-2">
        {Array.from({ length: BULB_COUNT }, (_, index) => (
          <span key={index} className={`garland-bulb ${BULB_CLASSES[index % 3]}`} />
        ))}
      </div>
    </div>
  );
}
