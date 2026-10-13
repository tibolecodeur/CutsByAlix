import type { GalleryPhoto } from "@/features/gallery/data";

/**
 * Photos de la vitrine, servies par notre domaine (public/media/galerie/), décision du
 * 2026-10-13 (consigne 27) : accord des personnes photographiées obtenu par Thibault.
 *
 * - Tirées de media-source/ (hors git) : métadonnées supprimées (EXIF, GPS, appareil), largeur
 *   1000 px, WebP. Vérifié par galleryMedia.files.test.ts.
 * - Affichées tant qu'AUCUNE photo n'est publiée par l'admin (ou si la galerie Supabase est
 *   injoignable) : dès qu'Alix publie ses photos, ce sont elles qui s'affichent.
 * - Pour en retirer une : supprimer la ligne ET le fichier. Attention, le dépôt est public :
 *   un fichier commité reste dans l'historique git.
 */
export const FEATURED_PHOTOS: GalleryPhoto[] = [
  {
    id: "vitrine-01",
    url: "/media/galerie/coupe-01.webp",
    altText: "Coupe courte texturée, dégradé bas sur la nuque, vue de profil.",
    width: 1000,
    height: 1744,
  },
  {
    id: "vitrine-02",
    url: "/media/galerie/coupe-02.webp",
    altText: "Coupe avec frange, dégradé sur les tempes et nuque plus longue, vue de profil.",
    width: 1000,
    height: 1672,
  },
  {
    id: "vitrine-03",
    url: "/media/galerie/coupe-03.webp",
    altText: "Coupe longue et lisse en arrondi, nuque dégagée, vue de profil.",
    width: 1000,
    height: 1746,
  },
  {
    id: "vitrine-04",
    url: "/media/galerie/coupe-04.webp",
    altText: "Coupe mi-longue texturée, côtés et nuque dégradés, vue de profil.",
    width: 1000,
    height: 1754,
  },
  {
    id: "vitrine-05",
    url: "/media/galerie/coupe-05.webp",
    altText: "Cheveux bouclés mi-longs, plus longs sur la nuque, vue de profil.",
    width: 1000,
    height: 1848,
  },
  {
    id: "vitrine-06",
    url: "/media/galerie/coupe-06.webp",
    altText: "Boucles courtes sur le dessus, dégradé sur les tempes, vue de profil.",
    width: 1000,
    height: 1692,
  },
  {
    id: "vitrine-07",
    url: "/media/galerie/coupe-07.webp",
    altText: "Coupe courte avec frange droite et dégradé sur les côtés, vue de profil.",
    width: 1000,
    height: 1746,
  },
];
