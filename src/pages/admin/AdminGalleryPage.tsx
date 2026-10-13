import { useEffect, useRef, useState } from "react";
import { PageMeta } from "@/components/PageMeta";
import { Section } from "@/components/Section";
import {
  EmptyMessage,
  ErrorMessage,
  LoadingMessage,
  SuccessMessage,
} from "@/components/StatusMessage";
import {
  getAdminGallery,
  sweepGalleryOrphans,
  type AdminGalleryItem,
} from "@/features/admin/gallery";
import { moveInList } from "@/features/admin/galleryOrder";
import { useAsync } from "@/lib/useAsync";
import { AdminGalleryCard, type GalleryCardChange } from "@/pages/admin/AdminGalleryCard";
import { AdminGalleryUpload } from "@/pages/admin/AdminGalleryUpload";
import { AdminShowcaseImport } from "@/pages/admin/AdminShowcaseImport";

/** Galerie : ajout de photos depuis le téléphone, publication, ordre, suppression. */
export function AdminGalleryPage() {
  const items = useAsync("gallery-admin", getAdminGallery);

  // Ramasse les fichiers restés sans ligne (envoi coupé, suppression inachevée). Au mieux,
  // sans rien afficher : un échec sera rattrapé à la prochaine ouverture.
  useEffect(() => {
    void sweepGalleryOrphans();
  }, []);

  return (
    <>
      <PageMeta title="Galerie" description="Gestion des photos de la galerie." />
      <Section>
        <h1>Galerie</h1>
      </Section>
      <Section aria-labelledby="add-photo">
        <AdminGalleryUpload onAdded={items.reload} />
      </Section>
      <Section aria-labelledby="photos-title">
        <h2 id="photos-title">Photos</h2>
        <p className="text-sm text-muted">Sur le site, les photos s'affichent en noir et blanc.</p>
        {items.status === "loading" && <LoadingMessage>Chargement des photos…</LoadingMessage>}
        {items.status === "error" && (
          <ErrorMessage onRetry={items.reload}>Impossible de charger les photos.</ErrorMessage>
        )}
        {items.status === "success" && (
          <GalleryList initialItems={items.data} onReload={items.reload} />
        )}
      </Section>
    </>
  );
}

/**
 * Liste gardée en état LOCAL : après « monter », « publier »… on met à jour la liste sans la
 * recharger (un rechargement la ferait disparaître le temps du chargement, et le focus avec).
 * La base a déjà validé l'action : on applique le même changement ici. `initialItems` ne sert
 * qu'au premier rendu : un rechargement complet (après un ajout) recrée ce composant.
 */
function GalleryList({
  initialItems,
  onReload,
}: {
  initialItems: AdminGalleryItem[];
  /** Rechargement complet (après l'import des photos de la vitrine). */
  onReload: () => void;
}) {
  const [list, setList] = useState(initialItems);
  const [lastMoved, setLastMoved] = useState<{ id: string; direction: "up" | "down" }>();
  const [announce, setAnnounce] = useState("");
  // Message visible (et annoncé) après un masquage : Alix doit savoir si les liens sont coupés.
  const [notice, setNotice] = useState("");
  const titleRef = useRef<HTMLParagraphElement>(null);

  function handleChange(item: AdminGalleryItem, change: GalleryCardChange) {
    const index = list.findIndex((i) => i.id === item.id);
    if (index < 0) return;
    switch (change.type) {
      case "moved": {
        const target = change.direction === "up" ? index - change.steps : index + change.steps;
        setList(moveInList(list, index, target));
        setLastMoved({ id: item.id, direction: change.direction });
        setAnnounce(`Photo déplacée en position ${target + 1} sur ${list.length}.`);
        break;
      }
      case "published":
        setList(list.map((i) => (i.id === item.id ? { ...i, published: true } : i)));
        setAnnounce("Photo publiée.");
        break;
      case "hidden":
        setList(
          list.map((i) =>
            i.id === item.id
              ? { ...i, published: false, imagePath: change.imagePath, imageUrl: change.imageUrl }
              : i,
          ),
        );
        setNotice(
          change.linksRevoked
            ? "Photo masquée du site. Les liens vers elle qui auraient été copiés ne fonctionnent plus."
            : "Photo masquée du site, mais des liens copiés avant peuvent encore l'afficher. Si la personne a retiré son accord, supprime la photo.",
        );
        break;
      case "alt":
        setList(list.map((i) => (i.id === item.id ? { ...i, altText: change.altText } : i)));
        setAnnounce("Texte alternatif enregistré.");
        break;
      case "deleted":
        setList(list.filter((i) => i.id !== item.id));
        setAnnounce("Photo supprimée.");
        // La carte disparaît avec le bouton touché : le focus revient au compteur.
        titleRef.current?.focus();
        break;
    }
  }

  const publishedCount = list.filter((i) => i.published).length;

  return (
    <div className="flex flex-col gap-4">
      <p ref={titleRef} tabIndex={-1}>
        {list.length === 0
          ? "Aucune photo."
          : `${list.length} photo${list.length > 1 ? "s" : ""}, dont ${publishedCount} publiée${publishedCount > 1 ? "s" : ""}.`}
      </p>
      {/* Annonce des actions pour les lecteurs d'écran (zone aria-live). */}
      <p role="status" className="sr-only">
        {announce}
      </p>
      {notice && <SuccessMessage>{notice}</SuccessMessage>}
      <SitePreview items={list.filter((i) => i.published)} />
      {list.length === 0 ? (
        <>
          <AdminShowcaseImport onImported={onReload} />
          <EmptyMessage>
            <p>Ou ajoute ta première photo avec les boutons ci-dessus.</p>
          </EmptyMessage>
        </>
      ) : (
        <ul aria-label="Toutes les photos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((item, index) => (
            <AdminGalleryCard
              key={item.id}
              item={item}
              position={index + 1}
              total={list.length}
              focusMove={lastMoved?.id === item.id ? lastMoved.direction : undefined}
              onChange={(change) => handleChange(item, change)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * « Sur le site » : les photos PUBLIÉES, dans l'ordre exact du carrousel de l'accueil, en noir
 * et blanc comme là-bas. Alix voit d'un coup d'œil ce que voient les clients.
 */
function SitePreview({ items }: { items: AdminGalleryItem[] }) {
  return (
    <section
      aria-labelledby="site-preview-title"
      className="flex flex-col gap-3 rounded-panel border border-ink/15 bg-surface p-4"
    >
      <h3 id="site-preview-title" className="text-xl">
        Sur le site
      </h3>
      {items.length === 0 ? (
        <p className="text-muted">Aucune photo n'est affichée sur le site.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {items.length} photo{items.length > 1 ? "s" : ""} affichée{items.length > 1 ? "s" : ""},
            dans cet ordre :
          </p>
          {/* Bande défilante focalisable (clavier : flèches), nommée pour les lecteurs d'écran. */}
          <ol
            role="list"
            tabIndex={0}
            aria-label="Ordre du carrousel"
            className="scrollbar-none -mx-1 flex list-none gap-2 overflow-x-auto px-1 pb-1"
          >
            {items.map((item, index) => (
              <li key={item.id} className="relative w-16 shrink-0">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.altText}
                    width={item.width}
                    height={item.height}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/5] h-auto w-full rounded-field object-cover grayscale"
                  />
                ) : (
                  <span className="flex aspect-[4/5] w-full items-center justify-center rounded-field bg-ink/5 text-xs text-muted">
                    Aperçu indisponible
                  </span>
                )}
                {/* Position dans le carrousel : décorative, la liste ordonnée la porte déjà. */}
                <span
                  aria-hidden="true"
                  className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-pill bg-orange text-sm font-bold text-ink"
                >
                  {index + 1}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
