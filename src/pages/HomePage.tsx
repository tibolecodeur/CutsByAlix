import { ButtonLink } from "@/components/Button";
import { GalleryCarousel } from "@/components/GalleryCarousel";
import { HeroVideo } from "@/components/HeroVideo";
import { InstagramLink } from "@/components/InstagramLink";
import { PageMeta } from "@/components/PageMeta";
import { BarberStripe, Section } from "@/components/Section";
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

/**
 * Accueil : une seule longue page, chaque section a une ancre (#prestations, #galerie…).
 * Sous la vidéo, fond blanc : tarifs, galerie (bande rose pâle), comment réserver.
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

      {/* Jonction vidéo / page blanche : la bande « poteau de barbier » pleine largeur. */}
      <span aria-hidden="true" className="bg-barber block h-3" />

      <Section id="prestations" aria-labelledby="prestations-titre" roomy>
        {/* Titre en pleine largeur : en colonne étroite, « PRESTATIONS » serait coupé. */}
        <h2 id="prestations-titre" className="title-section">
          Prestations
        </h2>
        <BarberStripe />
        <div className="flex max-w-2xl flex-col gap-6">
          <div>
            {services.status === "loading" && (
              <LoadingMessage>Chargement des prestations…</LoadingMessage>
            )}
            {services.status === "error" && (
              <ErrorMessage onRetry={services.reload}>
                Impossible de charger les prestations pour le moment. Réessaie dans quelques
                instants.
              </ErrorMessage>
            )}
            {services.status === "success" && services.data.length === 0 && (
              <EmptyMessage>
                <p>Aucune prestation disponible pour l'instant.</p>
              </EmptyMessage>
            )}
            {services.status === "success" && services.data.length > 0 && (
              <PriceBoard services={services.data} />
            )}
          </div>
          <p className="text-lg">Paiement en liquide ou par virement.</p>
        </div>
      </Section>

      {/* La seule bande rose pâle de la page : les photos noir et blanc y ressortent. Le
          carrousel est un composant isolé, remplaçable (GalleryCarousel). */}
      <Section id="galerie" aria-labelledby="galerie-titre" variant="blush" roomy>
        <h2 id="galerie-titre" className="title-section">
          Galerie
        </h2>
        <BarberStripe />
        {gallery.status === "loading" && <LoadingMessage>Chargement des photos…</LoadingMessage>}
        {gallery.status === "error" && (
          <p role="status">Les photos ne sont pas disponibles pour le moment.</p>
        )}
        {gallery.status === "success" && <GalleryCarousel photos={gallery.data} />}
      </Section>

      {/* pb-36 sur mobile : place pour le bouton collé en bas quand il revient à sa position. */}
      <Section
        id="reserver"
        aria-labelledby="reserver-titre"
        roomy
        className="pb-36 md:pb-section-roomy-lg"
      >
        <div className="grid gap-10 md:grid-cols-2 md:items-start md:gap-16">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <h2 id="reserver-titre" className="title-section">
                Comment réserver
              </h2>
              <BarberStripe />
            </div>
            {/* Frise : pastilles orange (chiffre noir, 6,59) reliées par un filet orange.
                `list-none` retire la sémantique de liste dans Safari / VoiceOver : role="list"
                la rend. */}
            <ol
              role="list"
              className="relative flex list-none flex-col gap-8 before:absolute before:top-7 before:bottom-7 before:left-7 before:w-0.5 before:-translate-x-1/2 before:bg-orange/40"
            >
              {BOOKING_STEPS.map((step, index) => (
                <li key={step} className="relative flex items-center gap-5">
                  <span
                    aria-hidden="true"
                    className="title-display flex size-14 shrink-0 items-center justify-center rounded-pill bg-orange text-3xl text-ink"
                  >
                    {index + 1}
                  </span>
                  <span className="text-xl font-semibold">{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {/* Le lieu, sur une carte rose très pâle, avec le contact Instagram. */}
          <div className="flex flex-col items-start gap-3 rounded-panel border border-ink/10 bg-blush/40 p-6 md:mt-28 md:p-8">
            <h3 className="text-[1.75rem] uppercase">Le lieu</h3>
            <p className="text-lg">{LOCATION_NOTICE}</p>
            <InstagramLink />
            <p className="mt-2 hidden md:block">
              <ButtonLink to="/reserver">Réserver</ButtonLink>
            </p>
          </div>
        </div>
      </Section>

      {/* Mobile : LE bouton « Réserver », collé en bas d'écran au-dessus de la barre d'accueil,
          avec une ombre teintée d'orange pour le détacher du blanc. `sticky` (et non `fixed`) :
          en fin de page il reprend sa place, sans masquer le pied de page. La marge négative le
          superpose au bas de #reserver plutôt qu'à un vide. Le conteneur laisse passer les
          touchers ; seul le bouton les capte. */}
      <div className="pointer-events-none sticky bottom-0 z-30 -mt-28 flex h-28 items-end px-safe pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden">
        <ButtonLink
          to="/reserver"
          className="pointer-events-auto w-full shadow-[0_10px_30px_-8px_rgb(255_106_26/0.7)]"
        >
          Réserver
        </ButtonLink>
      </div>
    </>
  );
}

/**
 * Carte des tarifs façon enseigne de salon : bande de barbier en tête, « COUPE ······ 10 € »,
 * prix en grands chiffres rose foncé (5,87 sur blanc), durée en étiquette rose pâle. Les
 * libellés « Prix : » et « Durée : » sont lus par les lecteurs d'écran, cachés à l'œil (les
 * points de conduite font ce travail visuellement).
 */
function PriceBoard({ services }: { services: Service[] }) {
  return (
    <div className="overflow-hidden rounded-panel border-2 border-ink bg-surface">
      <span aria-hidden="true" className="bg-barber block h-3" />
      <ul role="list" className="flex list-none flex-col divide-y divide-ink/10 px-6 md:px-8">
        {services.map((service) => (
          <li key={service.id} className="flex flex-col gap-3 py-6 md:py-8">
            <div className="flex items-end gap-3">
              {/* Interligne 1,1 : les jambages de l'italique ne sont pas rognés. */}
              <h3 className="text-[1.75rem] leading-[1.1] uppercase">{service.name}</h3>
              <span aria-hidden="true" className="leader-dots mb-2 min-w-6 flex-1 text-ink/30" />
              <p className="title-display shrink-0 text-5xl leading-none text-accent">
                <span className="sr-only">Prix : </span>
                {service.priceLabel ?? "À confirmer"}
              </p>
            </div>
            <p>
              <span className="inline-flex items-center rounded-pill bg-blush px-3 py-1 text-sm font-semibold">
                <span className="sr-only">Durée : </span>
                {service.durationMin} min
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
