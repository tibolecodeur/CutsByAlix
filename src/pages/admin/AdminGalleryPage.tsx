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
import { useAsync } from "@/lib/useAsync";
import { AdminGalleryCard, type GalleryCardChange } from "@/pages/admin/AdminGalleryCard";
import { AdminGalleryUpload } from "@/pages/admin/AdminGalleryUpload";

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
        {items.status === "success" && <GalleryList initialItems={items.data} />}
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
function GalleryList({ initialItems }: { initialItems: AdminGalleryItem[] }) {
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
        const target = change.direction === "up" ? index - 1 : index + 1;
        const next = [...list];
        [next[index], next[target]] = [next[target]!, next[index]!];
        setList(next);
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
      {list.length === 0 ? (
        <EmptyMessage>
          <p>Ajoute ta première photo avec les boutons ci-dessus.</p>
        </EmptyMessage>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
