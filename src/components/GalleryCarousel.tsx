import { useEffect, useRef, useState } from "react";
import { InstagramLink } from "@/components/InstagramLink";
import type { GalleryPhoto } from "@/features/gallery/data";
import { cx } from "@/lib/cx";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * Carrousel de la galerie, en CSS pur (`scroll-snap`), sans aucune dépendance.
 *
 * Volontairement ISOLÉ et remplaçable (consigne 27) : il ne reçoit qu'une liste de photos déjà
 * prêtes (URL signées par `getPublishedGallery`) et ne sait rien de Supabase. Un autre
 * carrousel (librairie, WebGL) peut le remplacer en gardant la même signature.
 *
 * - Le défilement est celui du navigateur : doigt, trackpad, flèches du clavier une fois la
 *   bande focalisée. `scroll-snap` cale chaque photo au bord, sans JavaScript.
 * - Pagination par pastilles (la photo en cours en pilule orange), boutons Précédente /
 *   Suivante de 52 px : souris, clavier, doigt. Un IntersectionObserver suit la photo
 *   visible et les extrémités (aucun écouteur de scroll).
 * - Photos en noir et blanc (docs/DESIGN.md), `loading="lazy"` : seules les photos proches
 *   de l'écran se téléchargent (4G). `width` / `height` réservent la place (pas de saut).
 * - Aucune photo : état vide avec le lien Instagram, plutôt qu'une bande vide.
 */
export function GalleryCarousel({ photos }: { photos: GalleryPhoto[] }) {
  if (photos.length === 0) return <GalleryEmpty />;
  return <PhotoStrip photos={photos} />;
}

function GalleryEmpty() {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-2 rounded-panel border border-current/25 p-6"
    >
      {/* Police de texte, pas de titre condensé : une phrase de plusieurs mots y reste
          lisible (les espaces du condensé italique se resserrent trop sous WebKit). */}
      <p className="text-xl font-bold">Photos bientôt disponibles.</p>
      <p>En attendant, les dernières coupes sont sur Instagram.</p>
      <InstagramLink label="Voir les coupes sur Instagram" />
    </div>
  );
}

/** Au-delà, des pastilles deviennent illisibles : compteur « 3 / 24 » sur tous les écrans. */
const MAX_DOTS = 10;

type StripState = {
  /** Photo la plus visible (celle que la pagination met en avant). */
  active: number;
  /** Première / dernière photo presque entièrement visibles : bouton correspondant inactif. */
  atStart: boolean;
  atEnd: boolean;
};

/**
 * État de départ, évalué à l'affichage (et non au chargement du module) : sans
 * IntersectionObserver (tests, très vieux navigateur), tout reste actif.
 */
function initialState(): StripState {
  return typeof IntersectionObserver === "undefined"
    ? { active: 0, atStart: false, atEnd: false }
    : { active: 0, atStart: true, atEnd: false };
}

function PhotoStrip({ photos }: { photos: GalleryPhoto[] }) {
  const stripRef = useRef<HTMLUListElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<StripState>(initialState);
  const count = photos.length;

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof IntersectionObserver === "undefined") return;
    const slides = Array.from(strip.children);
    // Part visible de chaque photo, mise à jour par le navigateur aux franchissements de seuil
    // (hors du fil principal) : l'équivalent d'un écouteur de scroll, sans son coût.
    const ratios = slides.map(() => 0);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios[slides.indexOf(entry.target)] = entry.intersectionRatio;
        }
        const best = Math.max(...ratios);
        setState({
          active: Math.max(0, ratios.indexOf(best)),
          atStart: ratios[0]! >= 0.9,
          atEnd: ratios[ratios.length - 1]! >= 0.9,
        });
      },
      { root: strip, threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] },
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, [photos]);

  /** Amène la photo `index` au bord gauche de la bande (là où scroll-snap la cale). */
  function goTo(index: number) {
    const strip = stripRef.current;
    const slide = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !slide) return;
    const padding = Number.parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0;
    strip.scrollTo({
      left: slide.offsetLeft - padding,
      // Le filet CSS (prefers-reduced-motion) ne couvre pas le défilement lancé en JS.
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Bande focalisable (tabIndex 0) : au clavier, les flèches la font défiler. Elle déborde
          jusqu'aux bords de l'écran sur mobile pour laisser deviner la photo suivante.
          `relative` : la position (offsetLeft) des photos se mesure depuis la bande. */}
      <ul
        ref={stripRef}
        role="list"
        tabIndex={0}
        aria-label="Photos de la galerie, défilement horizontal"
        className="scrollbar-none relative -mx-4 flex snap-x snap-mandatory scroll-px-4 list-none gap-3 overflow-x-auto overscroll-x-contain px-4 md:mx-0 md:scroll-px-0 md:gap-4 md:px-0"
      >
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className="w-[85%] shrink-0 snap-start sm:w-[55%] md:w-[calc((100%-2rem)/3)]"
          >
            <img
              src={photo.url}
              alt={photo.altText}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] h-auto w-full rounded-photo bg-current/5 object-cover grayscale"
            />
            <span className="sr-only">
              Photo {index + 1} sur {count}
            </span>
          </li>
        ))}
      </ul>

      {count > 1 && (
        <div className="flex items-center justify-between gap-4">
          {/* Mobile : compteur « 2 / 7 » (tient quel que soit le nombre de photos, chaque pastille
              prenant 44 px de large). À partir de md : pastilles, jusqu'à MAX_DOTS photos.
              Le compteur est masqué aux lecteurs d'écran : chaque photo annonce déjà
              « Photo n sur N ». */}
          <p
            aria-hidden="true"
            className={cx("text-sm font-semibold tabular-nums", count <= MAX_DOTS && "md:hidden")}
          >
            {state.active + 1} / {count}
          </p>
          {count <= MAX_DOTS && (
            <div className="hidden md:block">
              <Dots count={count} active={state.active} onSelect={goTo} />
            </div>
          )}
          <div className="flex gap-3">
            <StripButton
              label="Photo précédente"
              glyph="←"
              disabled={state.atStart}
              onClick={() => goTo(Math.max(0, state.active - 1))}
            />
            <StripButton
              label="Photo suivante"
              glyph="→"
              disabled={state.atEnd}
              onClick={() => goTo(Math.min(count - 1, state.active + 1))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type DotsProps = { count: number; active: number; onSelect: (index: number) => void };

/**
 * Pagination : une pastille par photo, la photo en cours devient une pilule orange allongée.
 * Chaque pastille est un bouton de 44 px de côté (zone tactile), la marque visible est petite.
 * Changement instantané (aucune animation de largeur).
 */
function Dots({ count, active, onSelect }: DotsProps) {
  return (
    <div className="-ml-3 flex flex-wrap items-center">
      {Array.from({ length: count }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Photo ${index + 1} sur ${count}`}
          aria-current={index === active ? "true" : undefined}
          onClick={() => onSelect(index)}
          className="group inline-flex size-tap items-center justify-center"
        >
          <span
            aria-hidden="true"
            className={cx(
              "block h-2 rounded-pill",
              index === active ? "w-6 bg-orange" : "w-2 bg-current/30",
            )}
          />
        </button>
      ))}
    </div>
  );
}

type StripButtonProps = {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
};

/** Bouton rond de 52 px, contour de la couleur du texte (noir ou blanc) ; flèche décorative. */
function StripButton({ label, glyph, disabled, onClick }: StripButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-button items-center justify-center rounded-pill border-2 border-current text-2xl motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.95] disabled:opacity-40"
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}
