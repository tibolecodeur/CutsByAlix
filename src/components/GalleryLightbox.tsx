import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { RoundIconButton } from "@/components/RoundIconButton";
import type { GalleryPhoto } from "@/features/gallery/data";
import { isLightboxEntry } from "@/features/gallery/lightboxHistory";
import { slideIndex, zoomKeyframes } from "@/features/gallery/zoom";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** Durée du zoom (ouverture et fermeture) : assez long pour « entrer dedans », jamais lent. */
const ZOOM_MS = 420;
/** Fondu seul (mouvements réduits, ou vignette introuvable) : court, sans aucun déplacement. */
const FADE_MS = 180;

type GalleryLightboxProps = {
  photos: GalleryPhoto[];
  /** Photo touchée dans le carrousel. */
  startIndex: number;
  /** Jeton de l'entrée d'historique ajoutée à l'ouverture (`pushLightboxEntry`). */
  historyToken: string;
  /** Vignette du carrousel de la photo `index` : départ du zoom à l'ouverture, arrivée à la fermeture. */
  getThumbnail: (index: number) => HTMLElement | null | undefined;
  /** Juste avant l'animation de fermeture : le carrousel se cale sur la photo `index`. */
  onBeforeClose: (index: number) => void;
  /** Fin de la fermeture : le carrousel retire la vue et rend le focus à la vignette. */
  onClosed: (index: number) => void;
};

/**
 * Vue agrandie de la galerie, en couleur, par-dessus la page floutée.
 *
 * - Fenêtre `<dialog>` native ouverte par `showModal()` : le navigateur gère seul le piège du
 *   focus (Tab reste dans la fenêtre), la touche Échap et rend le reste de la page inerte.
 * - Effet « on rentre dans la photo » : zoom FLIP depuis la vignette (`zoomKeyframes`), animé
 *   par l'API Web Animations (`element.animate`), sans librairie. Seuls `transform` et
 *   `opacity` bougent. Le passage du noir et blanc à la couleur est un fondu d'une copie
 *   noir et blanc posée par-dessus (le filtre `grayscale`, lui, n'est jamais animé).
 * - Fond : calque flouté FIXE (`lightbox-veil`) qui apparaît en fondu ; le flou ne s'anime pas.
 * - Photo suivante : même `scroll-snap` que le carrousel (doigt, flèches, clavier).
 * - Fermeture : bouton, toucher du fond, Échap, ou bouton « retour » du téléphone
 *   (`lightboxHistory.ts`).
 * - `prefers-reduced-motion` : fondu court, aucun zoom.
 */
export function GalleryLightbox({
  photos,
  startIndex,
  historyToken,
  getThumbnail,
  onBeforeClose,
  onClosed,
}: GalleryLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prefersReducedMotion = usePrefersReducedMotion();
  const count = photos.length;
  // `active` sert à l'affichage (compteur, flèches). `activeRef` garde la même valeur pour les
  // écouteurs (redimensionnement), qui la lisent sans être recréés à chaque photo.
  const [active, setActive] = useState(startIndex);
  const activeRef = useRef(startIndex);
  // Un seul départ de fermeture, même si Échap, le fond et « retour » arrivent ensemble.
  const closeRequested = useRef(false);
  const closeStarted = useRef(false);

  /**
   * Zoom entre la vignette et la grande photo `index`, ou simple fondu si le zoom n'a pas de
   * sens (mouvements réduits, vignette hors de l'écran). À la fermeture, la dernière image
   * reste affichée (`fill: "forwards"`) jusqu'au retrait de la fenêtre : aucun saut.
   */
  async function animate(index: number, direction: "open" | "close") {
    const frame = frameRefs.current[index];
    const photo = frame?.firstElementChild;
    const grayCopy = photo?.lastElementChild;
    const chrome = [veilRef.current, barRef.current];
    // Une fermeture pendant l'ouverture : on repart de la position réelle, sans transformation.
    for (const element of [frame, photo, grayCopy, stripRef.current, ...chrome]) {
      element?.getAnimations?.().forEach((animation) => animation.cancel());
    }
    const fill = direction === "close" ? "forwards" : "none";
    const appear =
      direction === "open" ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
    const thumb = getThumbnail(index);
    const thumbRect = thumb?.getBoundingClientRect();

    if (prefersReducedMotion || !frame || !thumb || !thumbRect || !isOnScreen(thumbRect)) {
      const timing = { duration: FADE_MS, easing: "ease-out", fill } as const;
      await Promise.all(
        [stripRef.current, ...chrome].map((element) => play(element, appear, timing)),
      );
      return;
    }

    const keyframes = zoomKeyframes(thumbRect, frame.getBoundingClientRect(), direction);
    // La vignette « quitte » le carrousel pendant le trajet : on ne la voit pas en double.
    thumb.style.visibility = "hidden";
    // Courbe de vitesse déjà calculée dans les images-clés : lecture linéaire.
    const zoomTiming = { duration: ZOOM_MS, easing: "linear", fill } as const;
    const fadeTiming = { duration: ZOOM_MS, easing: "ease-out", fill } as const;
    const toColor =
      direction === "open" ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }];
    await Promise.all([
      play(frame, keyframes.frame, zoomTiming),
      play(photo, keyframes.image, zoomTiming),
      play(grayCopy, toColor, fadeTiming),
      ...chrome.map((element) => play(element, appear, fadeTiming)),
    ]);
    thumb.style.visibility = "";
  }

  async function close() {
    if (closeStarted.current) return;
    closeStarted.current = true;
    const strip = stripRef.current;
    const index = strip
      ? slideIndex(strip.scrollLeft, strip.clientWidth, count)
      : activeRef.current;
    onBeforeClose(index);
    await animate(index, "close");
    onClosed(index);
  }

  /** Toute demande de fermeture passe par l'historique s'il porte notre entrée. */
  function requestClose() {
    if (closeRequested.current) return;
    closeRequested.current = true;
    // `back()` retire l'entrée ajoutée à l'ouverture ; `popstate` lance alors la fermeture.
    if (isLightboxEntry(historyToken)) window.history.back();
    else void close();
  }

  function goTo(index: number) {
    const strip = stripRef.current;
    if (!strip || index < 0 || index >= count) return;
    strip.scrollTo({
      left: index * strip.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function handleScroll() {
    const strip = stripRef.current;
    if (!strip) return;
    const index = slideIndex(strip.scrollLeft, strip.clientWidth, count);
    activeRef.current = index;
    setActive(index);
  }

  /**
   * Clavier écouté sur toute la page, pas seulement dans la fenêtre : une flèche désactivée
   * (dernière photo) perd le focus, et les touches doivent continuer de marcher.
   */
  function handleKeyDown(event: globalThis.KeyboardEvent) {
    if (event.key === "Escape") {
      // Sans quoi le navigateur fermerait la fenêtre d'un coup, sans animation.
      event.preventDefault();
      requestClose();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeRef.current + (event.key === "ArrowRight" ? 1 : -1));
    }
  }

  /** Toucher le fond (autour de la photo) ferme ; toucher la photo ne fait rien. */
  function handleSlideClick(event: MouseEvent<HTMLLIElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  /** Fenêtre fermée par le navigateur lui-même, sans passer par nous : on suit sans animer. */
  function handleNativeClose() {
    // Fermée puis rouverte par le double montage du mode strict de React : rien à faire.
    if (dialogRef.current?.open || closeStarted.current) return;
    closeStarted.current = true;
    onClosed(activeRef.current);
  }

  // `useEffectEvent` : une fonction appelée PAR un effet, qui lit toujours les dernières
  // props et le dernier état sans faire partie des dépendances de l'effet. Comme un callback
  // Java qui lirait les champs actuels de l'objet au lieu d'une copie prise à l'inscription.
  const onOpen = useEffectEvent(() => {
    const strip = stripRef.current;
    if (strip) strip.scrollLeft = startIndex * strip.clientWidth;
    activeRef.current = startIndex;
    closeButtonRef.current?.focus({ preventScroll: true });
    void animate(startIndex, "open");
  });
  const onPopState = useEffectEvent(() => {
    if (!isLightboxEntry(historyToken)) void close();
  });
  const onKeyDown = useEffectEvent(handleKeyDown);
  const onResize = useEffectEvent(() => {
    // Rotation de l'écran : la largeur des photos change, on reste sur la même photo.
    const strip = stripRef.current;
    if (strip) strip.scrollLeft = activeRef.current * strip.clientWidth;
  });

  // `useLayoutEffect` : s'exécute après l'insertion dans la page mais AVANT que le navigateur
  // ne peigne. La première image affichée est donc déjà la vignette, jamais la grande photo.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", ""); // très vieux navigateur, ou environnement de test
    }
    // La page derrière ne défile plus (iOS fait défiler le fond d'une fenêtre sinon).
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    onOpen();
    return () => {
      root.style.overflow = previousOverflow;
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", onPopState);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Galerie, photo agrandie"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={handleNativeClose}
      className="lightbox fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-transparent"
    >
      <div ref={veilRef} aria-hidden="true" className="lightbox-veil absolute inset-0" />

      {/* Une photo par largeur d'écran, calée par scroll-snap. La bande couvre tout l'écran :
          la photo en plein zoom n'est jamais rognée par ses bords. */}
      <ul
        ref={stripRef}
        role="list"
        aria-label="Photos agrandies"
        // Focalisable comme la bande du carrousel : au clavier, Tab peut y arriver (axe).
        tabIndex={0}
        onScroll={handleScroll}
        className="scrollbar-none absolute inset-0 flex snap-x snap-mandatory list-none overflow-x-auto overflow-y-hidden overscroll-contain"
      >
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            onClick={handleSlideClick}
            className="lightbox-slide flex h-full w-full shrink-0 snap-center snap-always items-center justify-center"
          >
            {/* Cadre aux proportions exactes de la photo, le plus grand possible à l'écran :
                largeur limitée par l'écran, ou par la hauteur disponible × proportions. */}
            <div
              ref={(element) => {
                frameRefs.current[index] = element;
              }}
              className="relative origin-top-left overflow-hidden rounded-photo bg-current/5"
              style={{
                aspectRatio: `${photo.width} / ${photo.height}`,
                width: `min(100%, 64rem, calc(var(--lightbox-photo-h) * ${photo.width / photo.height}))`,
              }}
            >
              <div className="absolute inset-0">
                <img
                  src={photo.url}
                  alt={photo.altText}
                  width={photo.width}
                  height={photo.height}
                  loading={index === startIndex ? "eager" : "lazy"}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                {/* Copie noir et blanc (même fichier, déjà en cache) : elle s'efface pendant
                    l'ouverture pour révéler la couleur, revient pendant la fermeture. */}
                <img
                  src={photo.url}
                  alt=""
                  aria-hidden="true"
                  width={photo.width}
                  height={photo.height}
                  loading={index === startIndex ? "eager" : "lazy"}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover opacity-0 grayscale"
                />
              </div>
            </div>
            <span className="sr-only">
              Photo {index + 1} sur {count}
            </span>
          </li>
        ))}
      </ul>

      {/* Commandes en bas de l'écran, à portée de pouce, au-dessus de la barre d'accueil. */}
      <div
        ref={barRef}
        className="lightbox-bar absolute inset-x-0 bottom-0 flex items-center justify-between gap-3"
      >
        <p aria-live="polite" className="text-sm font-semibold tabular-nums">
          {count > 1 && (
            <>
              <span aria-hidden="true">
                {active + 1} / {count}
              </span>
              <span className="sr-only">
                Photo {active + 1} sur {count}
              </span>
            </>
          )}
        </p>
        <div className="flex gap-3">
          {count > 1 && (
            <>
              <RoundIconButton
                label="Photo précédente"
                glyph="←"
                disabled={active === 0}
                onClick={() => goTo(active - 1)}
              />
              <RoundIconButton
                label="Photo suivante"
                glyph="→"
                disabled={active === count - 1}
                onClick={() => goTo(active + 1)}
              />
            </>
          )}
          <RoundIconButton
            ref={closeButtonRef}
            label="Fermer la photo"
            glyph="✕"
            onClick={requestClose}
          />
        </div>
      </div>
    </dialog>
  );
}

function isOnScreen(rect: DOMRect) {
  return (
    rect.width > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/** Lance une animation et attend sa fin ; sans API Web Animations (tests), ne fait rien. */
function play(
  element: Element | null | undefined,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<unknown> {
  if (!element || typeof element.animate !== "function") return Promise.resolve();
  // Une animation annulée (fermeture pendant l'ouverture) rejette sa promesse : c'est normal.
  return element.animate(keyframes, options).finished.catch(() => undefined);
}
