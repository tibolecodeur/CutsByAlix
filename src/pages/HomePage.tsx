import { ButtonLink } from "@/components/Button";
import { GalleryCarousel } from "@/components/GalleryCarousel";
import { HeroVideo } from "@/components/HeroVideo";
import { InstagramLink } from "@/components/InstagramLink";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
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

/** Accueil : une seule longue page, chaque section a une ancre (#prestations, #galerie…). */
export function HomePage() {
  const services = useAsync("services", getServices);
  const gallery = useAsync("gallery", getPublishedGallery);

  return (
    <>
      <PageMeta description="CutsByAlix, barber : coupe et coupe + barbe sur rendez-vous. Réserve ton créneau en ligne, paiement en liquide ou par virement." />

      {/* Hero plein écran : 100dvh (et non 100vh, faussé par la barre d'adresse mobile).
          `isolate` crée un contexte d'empilement : le fond (-z-10) reste DANS le hero.
          `pb-24` remonte le contenu au-dessus du fondu du bas (texte blanc jamais sur l'orange). */}
      <section
        id="accueil"
        aria-labelledby="accueil-titre"
        className="relative isolate flex h-dvh min-h-[30rem] flex-col items-center justify-center overflow-hidden bg-ink px-safe pb-24 text-center text-white [--focus-ring:var(--color-white)]"
      >
        <HeroVideo {...HERO_MEDIA} />
        {/* Le hero se fond dans la page : voile sombre, orange, puis le rose pâle par lequel
            commence le fond continu (bg-dawn). Décoratif, sous le contenu. */}
        <div
          aria-hidden="true"
          className="bg-dawn absolute inset-x-0 bottom-0 -z-10 h-[min(7rem,16%)]"
        />

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

      <Section id="prestations" aria-labelledby="prestations-titre">
        <h2 id="prestations-titre">Prestations</h2>
        {services.status === "loading" && (
          <LoadingMessage>Chargement des prestations…</LoadingMessage>
        )}
        {services.status === "error" && (
          <ErrorMessage onRetry={services.reload}>
            Impossible de charger les prestations pour le moment. Réessaie dans quelques instants.
          </ErrorMessage>
        )}
        {services.status === "success" && services.data.length === 0 && (
          <EmptyMessage>
            <p>Aucune prestation disponible pour l'instant.</p>
          </EmptyMessage>
        )}
        {services.status === "success" && services.data.length > 0 && (
          <PriceList services={services.data} />
        )}
        <p>Paiement en liquide ou par virement.</p>
      </Section>

      {/* Bloc noir, entré et sorti par un fondu orange : les photos en noir et blanc y
          ressortent. Le carrousel est un composant isolé, remplaçable (GalleryCarousel). */}
      <Section id="galerie" aria-labelledby="galerie-titre" variant="ink">
        <h2 id="galerie-titre">Galerie</h2>
        {/* Messages en texte blanc hérité : les StatusMessage sont faits pour fond clair. */}
        {gallery.status === "loading" && <p role="status">Chargement des photos…</p>}
        {gallery.status === "error" && (
          <p role="status">Les photos ne sont pas disponibles pour le moment.</p>
        )}
        {gallery.status === "success" && <GalleryCarousel photos={gallery.data} />}
      </Section>

      {/* pb-32 sur mobile : place pour le bouton collé en bas quand il revient à sa position. */}
      <Section id="reserver" aria-labelledby="reserver-titre" className="pb-32">
        <h2 id="reserver-titre">Comment réserver</h2>
        {/* `list-none` retire la sémantique de liste dans Safari / VoiceOver : role="list" la rend. */}
        <ol role="list" className="flex list-none flex-col gap-4">
          {BOOKING_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-4">
              {/* Pastille orange, chiffre noir (6,59) : jamais d'orange en texte. */}
              <span
                aria-hidden="true"
                className="title-display flex size-14 shrink-0 items-center justify-center rounded-pill border-2 border-ink bg-orange text-3xl text-ink"
              >
                {index + 1}
              </span>
              <span className="text-lg">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-start gap-1">
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
 * Grille tarifaire façon tableau de salon : « Coupe ········ 10 € », la durée en pastille
 * orange dessous. Les libellés « Prix : » et « Durée : » sont lus par les lecteurs d'écran,
 * cachés à l'œil (les points de conduite font ce travail visuellement).
 */
function PriceList({ services }: { services: Service[] }) {
  return (
    <ul role="list" className="flex list-none flex-col gap-8">
      {services.map((service) => (
        <li key={service.id} className="flex flex-col gap-2">
          <div className="flex items-end gap-3">
            {/* Interligne 1,1 : les jambages de l'italique ne sont pas rognés. */}
            <h3 className="text-[2rem] leading-[1.1]">{service.name}</h3>
            <span aria-hidden="true" className="leader-dots mb-2.5 min-w-6 flex-1 text-ink/60" />
            <p className="title-display shrink-0 text-5xl leading-none">
              <span className="sr-only">Prix : </span>
              {service.priceLabel ?? "À confirmer"}
            </p>
          </div>
          <p>
            <span className="inline-flex items-center rounded-pill bg-orange px-3 py-1 text-sm font-semibold text-ink">
              <span className="sr-only">Durée : </span>
              {service.durationMin} min
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
