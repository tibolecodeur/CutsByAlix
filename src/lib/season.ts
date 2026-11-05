import { parisDayKey } from "@/lib/dates";

/**
 * Versions saisonnières du site (ADR 0013). La version de base reste intacte ; une saison
 * (aujourd'hui seulement Noël) se pose PAR-DESSUS avec ses propres décors (src/seasons/noel/),
 * puis s'efface d'elle-même à la fin de sa période. Rien à modifier ni à défaire chaque année.
 *
 * Qui choisit la saison, du plus fort au plus faible :
 * 1. `?saison=noel` ou `?saison=base` dans l'adresse : aperçu, à tout moment (garde la saison
 *    pour toute la visite, la navigation ne recharge pas la page) ;
 * 2. `VITE_SEASON` au build (Cloudflare Pages) : `base` coupe Noël, `noel` le force ;
 * 3. sinon (`auto`, par défaut) : le calendrier ci-dessous, en heure de Paris.
 */
export type Season = "base" | "noel";

/** Période de chaque saison, en « MM-JJ » inclus. Noël : du 1er décembre à l'Épiphanie. */
export const SEASON_PERIODS: Record<Exclude<Season, "base">, { from: string; to: string }> = {
  noel: { from: "12-01", to: "01-06" },
};

const SEASONS: readonly Season[] = ["base", "noel"];

function isSeason(value: string | null | undefined): value is Season {
  return SEASONS.includes(value as Season);
}

/** « MM-JJ » dans la période, y compris quand elle chevauche le Nouvel An (12-01 → 01-06). */
function inPeriod(monthDay: string, { from, to }: { from: string; to: string }): boolean {
  return from <= to ? monthDay >= from && monthDay <= to : monthDay >= from || monthDay <= to;
}

/** Saison du calendrier pour cet instant, jour de Paris. */
export function seasonFor(now: Date): Season {
  const monthDay = parisDayKey(now).slice(5);
  for (const [season, period] of Object.entries(SEASON_PERIODS)) {
    if (inPeriod(monthDay, period)) return season as Season;
  }
  return "base";
}

export function resolveSeason({
  now,
  setting,
  search,
}: {
  now: Date;
  /** Valeur de VITE_SEASON : « auto » (ou vide), « base », « noel ». */
  setting?: string;
  /** Partie « ?… » de l'adresse. */
  search?: string;
}): Season {
  const preview = new URLSearchParams(search ?? "").get("saison");
  if (isSeason(preview)) return preview;
  const forced = setting?.trim().toLowerCase();
  if (isSeason(forced)) return forced;
  return seasonFor(now);
}

/** Saison de cette visite, choisie une fois au chargement. */
export const CURRENT_SEASON: Season = resolveSeason({
  now: new Date(),
  setting: import.meta.env.VITE_SEASON,
  search: typeof window === "undefined" ? "" : window.location.search,
});

/** Pose la saison sur <html data-season="…"> : les couleurs de la saison s'appliquent en CSS. */
export function applySeason(season: Season = CURRENT_SEASON): void {
  document.documentElement.dataset.season = season;
}
