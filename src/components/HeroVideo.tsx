import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/** Une source de la vidéo : le navigateur prend la PREMIÈRE dont il sait lire le `type`. */
export type HeroVideoSource = {
  src: string;
  /** Type MIME avec codec, ex. `video/webm; codecs="av01.0.01M.08"`. */
  type: string;
};

type HeroVideoProps = {
  /** Sources par ordre de préférence (la plus légère d'abord), dans public/media/. */
  sources: readonly HeroVideoSource[];
  /** Image fixe affichée avant la vidéo, ou à sa place (animations réduites, lecture refusée). */
  posterSrc: string;
};

/**
 * Fond du hero : vidéo en noir et blanc, teinte duotone rose → orange, puis voile sombre.
 * Purement décoratif (`aria-hidden`) : le texte du hero porte toute l'information.
 *
 * Contraste garanti du texte blanc, même si l'image est entièrement blanche : le voile #111111
 * à 60 % ramène le blanc à une luminance de 0,16, soit 4,95 contre du blanc (AA : 4,5).
 *
 * Pas de vidéo du tout (donc rien de téléchargé) si l'utilisateur réduit les animations ; poster
 * seul aussi si le navigateur refuse la lecture automatique (mode économie d'énergie d'iOS) ou
 * ne sait lire aucune source.
 */
export function HeroVideo({ sources, posterSrc }: HeroVideoProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Clé des sources : sert à mémoriser QUELLE vidéo a échoué. Si les sources changent, la
  // nouvelle vidéo est retentée sans effet de « remise à zéro ».
  const sourcesKey = sources.map((source) => source.src).join("|");
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const showVideo = sources.length > 0 && !prefersReducedMotion && failedKey !== sourcesKey;

  useEffect(() => {
    const video = videoRef.current;
    if (!showVideo || !video) return;

    // `autoplay` seul échoue en silence sur iOS en économie d'énergie. `play()` renvoie une
    // promesse, rejetée dans ce cas : on bascule alors sur le poster.
    const play = () => video.play()?.catch(() => setFailedKey(sourcesKey));
    play();

    // Onglet caché : pause (batterie, données mobiles) ; reprise au retour sur l'onglet.
    const onVisibilityChange = () => {
      if (document.hidden) video.pause();
      else play();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [showVideo, sourcesKey]);

  const onError = () => setFailedKey(sourcesKey);

  return (
    <div aria-hidden="true" className="absolute inset-0 -z-10" data-testid="hero-media">
      <div className="absolute inset-0 grayscale">
        {/* Visible dès l'arrivée : surtout pas de loading="lazy", et priorité haute. */}
        <img src={posterSrc} alt="" fetchPriority="high" className="size-full object-cover" />
        {showVideo && (
          <video
            ref={videoRef}
            poster={posterSrc}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            disablePictureInPicture
            className="absolute inset-0 size-full object-cover"
          >
            {sources.map((source, index) => (
              // Avec des <source>, l'erreur de chargement est émise par la DERNIÈRE source
              // (toutes ont échoué), pas par la balise <video>.
              <source
                key={source.src}
                src={source.src}
                type={source.type}
                onError={index === sources.length - 1 ? onError : undefined}
              />
            ))}
          </video>
        )}
      </div>
      {/* Duotone FIXE (jamais animé) : le noir reste noir, le blanc devient rose → orange. */}
      <div className="absolute inset-0 bg-linear-to-br from-accent to-orange mix-blend-multiply" />
      <div className="absolute inset-0 bg-ink/60" />
    </div>
  );
}
