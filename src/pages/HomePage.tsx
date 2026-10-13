import { ButtonLink } from "@/components/Button";
import { GalleryCarousel } from "@/components/GalleryCarousel";
import { HeroVideo } from "@/components/HeroVideo";
import { InstagramLink } from "@/components/InstagramLink";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { getServices, type Service } from "@/features/booking/data";
import { getPublishedGallery } from "@/features/gallery/data";
import { LOCATION_NOTICE } from "@/lib/contact";
import { useAsync } from "@/lib/useAsync";

/**
 * Médias du hero, dans public/media/ (servis tels quels par notre domaine, aucun tiers).
 * Boucle de 14,6 s tirée du reel (media-source/, hors git), 360×640, 30 fps, sans son.
 * WebM AV1 d'abord (0,7 Mo) ; le MP4 H.264 (1,1 Mo) sert aux navigateurs sans AV1
 * (la plupart des iPhone). Détails et commandes ffmpeg : docs/DESIGN.md.
 */
const HERO_MEDIA = {
  sources: [
    { src: "/media/hero.webm", type: 'video/webm; codecs="av01.0.01M.08"' },
    { src: "/media/hero.mp4", type: 'video/mp4; codecs="avc1.64001F"' },
  ],
  posterSrc: "/media/hero-poster.jpg",
} as const;

const BOOKING_STEPS = [
  "Choisis une prestation.",
  "Choisis un jour.",
  "Choisis un créneau libre.",
] as const;

/** Filet orange fin au-dessus d'un titre de section : l'accent, sans décor de plus. */
function Rule() {
  return <span aria-hidden="true" className="block h-0.5 w-12 bg-orange" />;
}

/**
 * Accueil : une seule longue page, chaque section a une ancre (#prestations, #galerie…).
 * Fonds unis en alternance, transitions nettes : hero (vidéo), noir, blanc cassé, noir.
 */
export function HomePage() {
  const services = useAsync("services", getServices);
  const gallery = useAsync("gallery", getPublishedGallery);

  return (
    <>
      <PageMeta description="CutsByAlix, barber : coupe et coupe + barbe sur rendez-vous. Réserve ton créneau en ligne, paiement en liquide ou par virement." />

      {/* Hero plein écran en 100svh : la hauteur de l'écran barres du navigateur affichées,
          stable pendant le défilement (100vh, faussé par la barre d'adresse mobile, déborde ;
          100dvh change de taille quand la barre se replie). `isolate` crée un contexte
          d'empilement : le fond (-z-10) reste DANS le hero. */}
      <section
        id="accueil"
        aria-labelledby="accueil-titre"
        className="relative isolate flex h-svh min-h-[30rem] flex-col items-center justify-center overflow-hidden bg-ink px-safe text-center text-white [--focus-ring:var(--color-white)]"
      >
        <HeroVideo {...HERO_MEDIA} />

        {/* TODO logo : logo texte provisoire, à remplacer par le fichier HD / SVG.
            Le nom accessible reste « CutsByAlix » ; les trois lignes sont décoratives. */}
        <h1
          id="accueil-titre"
          className="title-display text-[clamp(5rem,26vw,11rem)] leading-[0.8] uppercase"
        >
          <span className="sr-only">CutsByAlix</span>
          <span aria-hidden="true" className="block">
            Cuts
          </span>
          <span aria-hidden="true" className="block">
            By
          </span>
          <span aria-hidden="true" className="block">
            Alix
          </span>
        </h1>
        <p className="mt-6 max-w-xs text-lg">
          Coupes et barbes soignées, sur rendez-vous. Réserve ta coupe en une minute.
        </p>
        {/* Desktop seulement : sur mobile, le bouton collé en bas d'écran le remplace. */}
        {/* Le `hidden` est posé sur un conteneur : sur le bouton, il entrerait en conflit avec
            son `inline-flex` (cx ne fusionne pas les classes Tailwind). */}
        <p className="mt-8 hidden md:block">
          <ButtonLink to="/reserver">Réserver</ButtonLink>
        </p>
      </section>

      {/* Noir : les prix en grands chiffres orange (6,59 sur noir, interdit sur clair). */}
      <Section id="prestations" aria-labelledby="prestations-titre" variant="ink" roomy>
        <Rule />
        <h2 id="prestations-titre" className="title-section">
          Prestations
        </h2>
        {/* Messages en texte blanc hérité : les StatusMessage sont faits pour fond clair. */}
        {services.status === "loading" && <p role="status">Chargement des prestations…</p>}
        {services.status === "error" && (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="font-bold">
              Impossible de charger les prestations pour le moment. Réessaie dans quelques instants.
            </p>
            <button
              type="button"
              onClick={services.reload}
              className="link inline-flex min-h-tap items-center"
            >
              Réessayer
            </button>
          </div>
        )}
        {services.status === "success" && services.data.length === 0 && (
          <p role="status">Aucune prestation disponible pour l'instant.</p>
        )}
        {services.status === "success" && services.data.length > 0 && (
          <PriceList services={services.data} />
        )}
        <p className="text-white/75">Paiement en liquide ou par virement.</p>
      </Section>

      {/* Blanc cassé : les photos en noir et blanc y gagnent en netteté. Le carrousel est un
          composant isolé, remplaçable (GalleryCarousel). */}
      <Section id="galerie" aria-labelledby="galerie-titre" roomy>
        <Rule />
        <h2 id="galerie-titre" className="title-section">
          Galerie
        </h2>
        {gallery.status === "loading" && (
          <p role="status" className="text-muted">
            Chargement des photos…
          </p>
        )}
        {gallery.status === "error" && (
          <p role="status" className="text-muted">
            Les photos ne sont pas disponibles pour le moment.
          </p>
        )}
        {gallery.status === "success" && <GalleryCarousel photos={gallery.data} />}
      </Section>

      {/* Noir, grands numéros orange. pb-32 sur mobile : place pour le bouton collé en bas
          quand il revient à sa position. */}
      <Section id="reserver" aria-labelledby="reserver-titre" variant="ink" roomy className="pb-36">
        <Rule />
        <h2 id="reserver-titre" className="title-section">
          Comment réserver
        </h2>
        {/* `list-none` retire la sémantique de liste dans Safari / VoiceOver : role="list" la rend. */}
        <ol role="list" className="flex list-none flex-col gap-6">
          {BOOKING_STEPS.map((step, index) => (
            <li key={step} className="flex items-baseline gap-5">
              <span
                aria-hidden="true"
                className="title-display w-16 shrink-0 text-6xl leading-none text-orange"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-xl">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-start gap-1 border-t border-white/20 pt-6">
          <p className="font-semibold">{LOCATION_NOTICE}</p>
          <InstagramLink />
        </div>
        <p className="hidden md:block">
          <ButtonLink to="/reserver">Réserver</ButtonLink>
        </p>
      </Section>

      {/* Mobile : LE bouton « Réserver », collé en bas d'écran au-dessus de la barre d'accueil.
          `sticky` (et non `fixed`) : en fin de page il reprend sa place, sans masquer le pied
          de page. La marge négative le superpose au bas de #reserver plutôt qu'à un vide.
          Le conteneur laisse passer les touchers ; seul le bouton les capte. */}
      <div className="pointer-events-none sticky bottom-0 z-30 -mt-28 flex h-28 items-end px-safe pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <ButtonLink to="/reserver" className="pointer-events-auto w-full">
          Réserver
        </ButtonLink>
      </div>
    </>
  );
}

/**
 * Grille tarifaire façon tableau de salon : « Coupe ········ 10 € », prix en grands chiffres
 * orange, durée en dessous. Les libellés « Prix : » et « Durée : » sont lus par les lecteurs
 * d'écran, cachés à l'œil (les points de conduite font ce travail visuellement).
 */
function PriceList({ services }: { services: Service[] }) {
  return (
    <ul role="list" className="flex list-none flex-col gap-10">
      {services.map((service) => (
        <li key={service.id} className="flex flex-col gap-2">
          <div className="flex items-end gap-3">
            {/* Interligne 1,1 : les jambages de l'italique ne sont pas rognés. */}
            <h3 className="text-[2rem] leading-[1.1] uppercase">{service.name}</h3>
            <span aria-hidden="true" className="leader-dots mb-2.5 min-w-6 flex-1 text-white/40" />
            <p className="title-display shrink-0 text-6xl leading-none text-orange">
              <span className="sr-only">Prix : </span>
              {service.priceLabel ?? "À confirmer"}
            </p>
          </div>
          <p className="text-white/75">
            <span className="sr-only">Durée : </span>
            {service.durationMin} min
          </p>
        </li>
      ))}
    </ul>
  );
}
