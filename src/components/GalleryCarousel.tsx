import { useEffect, useRef, useState } from "react";
import { InstagramLink } from "@/components/InstagramLink";
import type { GalleryPhoto } from "@/features/gallery/data";
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
 * - Les boutons Précédente / Suivante (44 px et plus) servent à la souris et au clavier ; ils
 *   se désactivent aux extrémités grâce à un IntersectionObserver (aucun écouteur de scroll).
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
    <div role="status" className="flex flex-col items-start gap-2 border border-current/25 p-6">
      {/* Police de texte, pas de titre condensé : une phrase de plusieurs mots y reste
          lisible (les espaces du condensé italique se resserrent trop sous WebKit). */}
      <p className="text-xl font-bold">Photos bientôt disponibles.</p>
      <p>En attendant, les dernières coupes sont sur Instagram.</p>
      <InstagramLink label="Voir les coupes sur Instagram" />
    </div>
  );
}

type Edge = "start" | "end";

function PhotoStrip({ photos }: { photos: GalleryPhoto[] }) {
  const stripRef = useRef<HTMLUListElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Extrémités atteintes. Au départ, on est au début ; la fin dépend de la largeur d'écran
  // (sur desktop, deux ou trois photos tiennent sans défiler). Sans IntersectionObserver
  // (tests, très vieux navigateur), les deux boutons restent actifs : le défilement natif
  // s'arrête de lui-même aux bords.
  const [atEdge, setAtEdge] = useState<Record<Edge, boolean>>(() =>
    typeof IntersectionObserver === "undefined"
      ? { start: false, end: false }
      : { start: true, end: false },
  );

  useEffect(() => {
    const strip = stripRef.current;
    const first = strip?.firstElementChild;
    const last = strip?.lastElementChild;
    if (!strip || !first || !last || typeof IntersectionObserver === "undefined") return;
    // Une extrémité est « atteinte » quand sa photo est presque entièrement visible dans la
    // bande (`root`), comme un écouteur de scroll, mais calculé par le navigateur hors du
    // fil principal et seulement aux franchissements de seuil.
    const observer = new IntersectionObserver(
      (entries) => {
        setAtEdge((previous) => {
          const next = { ...previous };
          for (const entry of entries) {
            next[entry.target === first ? "start" : "end"] = entry.intersectionRatio >= 0.9;
          }
          return next;
        });
      },
      { root: strip, threshold: [0, 0.9, 1] },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [photos]);

  function scrollByOnePhoto(direction: 1 | -1) {
    const strip = stripRef.current;
    const photo = strip?.firstElementChild as HTMLElement | null | undefined;
    if (!strip || !photo) return;
    const gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0;
    strip.scrollBy({
      left: direction * (photo.offsetWidth + gap),
      // Le filet CSS (prefers-reduced-motion) ne couvre pas le défilement lancé en JS.
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bande focalisable (tabIndex 0) : au clavier, les flèches la font défiler. Elle déborde
          jusqu'aux bords de l'écran sur mobile pour laisser deviner la photo suivante. */}
      <ul
        ref={stripRef}
        role="list"
        tabIndex={0}
        aria-label="Photos de la galerie, défilement horizontal"
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory scroll-px-4 list-none gap-3 overflow-x-auto overscroll-x-contain px-4 md:mx-0 md:scroll-px-0 md:px-0"
      >
        {photos.map((photo) => (
          <li key={photo.id} className="w-[78%] shrink-0 snap-start sm:w-[45%] md:w-[31%]">
            <img
              src={photo.url}
              alt={photo.altText}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] h-auto w-full bg-current/5 object-cover grayscale"
            />
          </li>
        ))}
      </ul>

      {photos.length > 1 && (
        <div className="flex justify-end gap-3">
          <StripButton
            label="Photo précédente"
            glyph="←"
            disabled={atEdge.start}
            onClick={() => scrollByOnePhoto(-1)}
          />
          <StripButton
            label="Photo suivante"
            glyph="→"
            disabled={atEdge.end}
            onClick={() => scrollByOnePhoto(1)}
          />
        </div>
      )}
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
