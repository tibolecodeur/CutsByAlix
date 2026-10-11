import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { HeroVideo } from "@/components/HeroVideo";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "@/components/StatusMessage";
import { getServices } from "@/features/booking/data";
import { getPublishedGallery, type GalleryPhoto } from "@/features/gallery/data";
import { useAsync } from "@/lib/useAsync";

/**
 * Médias du hero, à déposer dans public/media/ (servis tels quels à la racine du site).
 * TODO média : vidéo MP4 H.264, 720p vertical, boucle de 6 s max, ~1,5 Mo, et son poster.
 * Exemple : { videoSrc: "/media/hero.mp4", posterSrc: "/media/hero-poster.jpg" }.
 * Tant qu'ils sont absents, le hero affiche un fond provisoire.
 */
const HERO_MEDIA: { videoSrc?: string; posterSrc?: string } = {};

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
      <PageMeta description="CutsByAlix, barber : coupe et coupe + barbe sur rendez-vous. Réserve ton créneau en ligne, paiement sur place." />

      {/* Hero plein écran : 100dvh (et non 100vh, faussé par la barre d'adresse mobile).
          `isolate` crée un contexte d'empilement : le fond (-z-10) reste DANS le hero. */}
      <section
        id="accueil"
        aria-labelledby="accueil-titre"
        className="relative isolate flex h-dvh min-h-[30rem] flex-col items-center justify-center overflow-hidden bg-ink px-safe text-center text-white [--focus-ring:var(--color-white)]"
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
          Accroche provisoire : coupes et barbes soignées, sur rendez-vous.
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
          <ul className="grid gap-4 sm:grid-cols-2">
            {services.data.map((service) => (
              <Card as="li" key={service.id}>
                <h3>{service.name}</h3>
                <p className="text-muted">Durée : {service.durationMin} min</p>
                <p className="font-semibold">Prix : {service.priceLabel ?? "À confirmer"}</p>
              </Card>
            ))}
          </ul>
        )}
      </Section>

      {/* Bloc noir : les photos en noir et blanc y ressortent. */}
      <Section id="galerie" aria-labelledby="galerie-titre" variant="ink">
        <h2 id="galerie-titre">Galerie</h2>
        {/* Messages en texte blanc hérité : les StatusMessage sont faits pour fond clair. */}
        {gallery.status === "loading" && <p role="status">Chargement des photos…</p>}
        {gallery.status === "error" && (
          <p role="status">Les photos ne sont pas disponibles pour le moment.</p>
        )}
        {gallery.status === "success" &&
          (gallery.data.length === 0 ? (
            <p>Photos bientôt disponibles.</p>
          ) : (
            <GalleryGrid photos={gallery.data} />
          ))}
      </Section>

      {/* pb-32 sur mobile : place pour le bouton collé en bas quand il revient à sa position. */}
      <Section id="reserver" aria-labelledby="reserver-titre" variant="blush" className="pb-32">
        <h2 id="reserver-titre">Comment réserver</h2>
        {/* `list-none` retire la sémantique de liste dans Safari / VoiceOver : role="list" la rend. */}
        <ol role="list" className="flex list-none flex-col gap-3">
          {BOOKING_STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="title-display flex size-12 shrink-0 items-center justify-center rounded-pill bg-ink text-2xl text-white"
              >
                {index + 1}
              </span>
              <span className="text-lg">{step}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-1">
          <p>Paiement en liquide, sur place.</p>
          <p>Le lieu exact t'est communiqué au moment de la réservation.</p>
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
 * Grille de la galerie : photos en noir et blanc (docs/DESIGN.md), carrées. `width` et
 * `height` réservent la place avant le chargement (pas de saut de mise en page) ;
 * `loading="lazy"` : seules les photos proches de l'écran se téléchargent (4G).
 */
function GalleryGrid({ photos }: { photos: GalleryPhoto[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id}>
          <img
            src={photo.url}
            alt={photo.altText}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            className="aspect-square h-auto w-full object-cover grayscale"
          />
        </li>
      ))}
    </ul>
  );
}
