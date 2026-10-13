# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Ce projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté

- Galerie réelle (consigne 20, ADR 0006) : Alix ajoute ses photos depuis l'appareil photo ou
  la galerie du téléphone. Chaque photo est préparée sur le téléphone avant l'envoi : réduite
  à 1200 px, redressée, ré-encodée en WebP (JPEG sur Safari), **sans aucune métadonnée** (ni
  GPS, ni date, ni modèle). Texte alternatif obligatoire ; publication seulement après avoir
  confirmé l'accord de la personne photographiée ; publier / masquer, monter / descendre,
  modifier, supprimer avec confirmation. Masquer une photo publiée change le nom de son
  fichier : tous les liens déjà distribués cessent de fonctionner. 60 photos au plus. L'accueil affiche les photos
  publiées (noir et blanc, chargement différé, dimensions réservées).

### Modifié

- Design v1 (consigne 27) : arrivée sur la vidéo plein écran (`100svh`) et son bouton orange,
  puis un site blanc aux couleurs orange et rose, sur toutes les pages (admin compris).
  Signature « poteau de barbier » (rayures orange / blanc / rose foncé en bandes fines), carte
  des tarifs façon enseigne de salon (prix en grands chiffres rose foncé), galerie sur une bande
  rose pâle, frise « Comment réserver » à pastilles orange, en-tête commun des pages (titre,
  rayures, accroche), en-tête en verre dépoli avec repli opaque. Galerie en carrousel CSS
  `scroll-snap` (composant isolé `GalleryCarousel`, état vide avec lien Instagram). Accroche
  définitive. Lieu : « Lieu exact communiqué par DM sur Instagram, sur demande » sur l'accueil
  et à chaque étape de /reserver ; plus aucune mention de paiement sur /reserver (elle reste
  sur l'accueil). Mentions légales, politique de confidentialité et nouvelle page
  **Conditions de réservation** (/conditions) rédigées, informations personnelles à compléter.
- Tarifs et paiement (consigne 26, ADR 0011) : Coupe 60 min / 10 €, Coupe + barbe 70 min / 12 € ;
  paiement « en liquide ou par virement » (aucune coordonnée bancaire sur le site). Les créneaux
  et la fin des rendez-vous restent de 70 min pour toutes les prestations.

- Délai minimum de réservation ramené de 5 h à **2 h** (consigne 28) : on peut réserver jusqu'à
  2 h avant le rendez-vous. L'annulation en ligne reste possible jusqu'à 24 h avant : un RDV
  pris à moins de 24 h n'est pas annulable en ligne (le client en est prévenu). Migration à
  appliquer AVANT le déploiement du site.
- Bucket « gallery » **privé** : les photos s'affichent par URL signées d'1 h, une photo
  masquée n'est plus accessible. Fichiers nommés par un uuid (jamais le nom d'origine), WebP
  ou JPEG, 2 Mo max, aucun remplacement. `gallery_items.caption` remplacée par `alt_text`.
- Écritures de la galerie par fonctions admin uniquement ; le public ne lit plus que les
  colonnes d'affichage des photos publiées.

### Supprimé

- Fausse base en mémoire (`src/lib/fakeDb.ts`) et emplacements photo provisoires.

- Socle technique : Vite 8, React 19, TypeScript strict, React Router 8, Tailwind CSS v4.
  shadcn/ui est installable mais volontairement non initialisé : son preset impose une police
  et un thème, décision reportée à la phase 3.
- Outillage de qualité : ESLint (flat config) et Prettier.
- Tests : Vitest + Testing Library avec couverture (seuil 80 % sur `src/features/` et `src/lib/`),
  Playwright en mobile et desktop.
- Arborescence `src/pages`, `src/components`, `src/features`, `src/lib`, et client Supabase unique.
- Sept routes avec des pages vides et un menu de navigation : `/`, `/prestations`, `/galerie`,
  `/reserver`, `/annuler`, `/admin`, et une page 404.
- Intégration continue GitHub Actions : lint, types, couverture, build, end-to-end.
- Modèle de pull request, `vercel.json` pour le routage SPA, ADR 0001 sur le choix de la stack.
- Garde-fou de développement : hook Claude Code interdisant d'éditer des fichiers sur `main`.
- Base de données Supabase (phase 2) :
  - CLI Supabase en devDependency, configuration locale alignée sur le projet distant
    (inscriptions fermées, aucune table exposée par défaut, mot de passe robuste) ;
  - tables `services`, `locations`, `availabilities`, `bookings`, `gallery_items`, `admins` ;
  - aucune double réservation ni dispo qui se chevauche, tous lieux confondus (contraintes
    d'exclusion) ; RDV entièrement dans une dispo du même lieu ; fin du RDV calculée par la base ;
  - RLS sur toutes les tables et droits explicites : le public ne lit que les prestations actives
    et les photos publiées ;
  - fonctions `get_available_slots`, `create_booking`, `get_booking`, `cancel_booking` ;
    l'adresse privée du lieu n'est révélée qu'à la personne qui a réservé ;
  - anti-spam : honeypot, 2 RDV futurs maximum par téléphone ou email ;
  - règles par défaut (à confirmer) centralisées dans `private.settings()` ;
  - bucket Storage `gallery` (lecture publique, écriture admin) ;
  - `seed.sql` avec des adresses factices ;
  - tests pgTAP (accès interdits, chevauchements, délais, tokens, changement d'heure, Storage)
    et job CI dédié ;
  - ADR 0002 (modèle de données, sécurité, confidentialité de l'adresse).
- Documentation des contraintes mobiles, iOS / Android et des navigateurs supportés.
- Squelette des pages, sans style (structure et textes provisoires) :
  - accueil en une longue page avec sections ancrées (`#accueil`, `#prestations`, `#galerie`,
    `#reserver`), emplacements réservés pour la photo du barber et 6 photos de galerie ;
  - prestations provisoires dans un seul fichier (`src/features/booking/provisionalServices.ts`),
    prix « À confirmer » ;
  - pages `/reserver` (formulaire en 6 étapes, sans envoi), `/annuler`, `/admin` (connexion,
    sans logique), `/mentions-legales`, `/politique-confidentialite`, 404 ;
  - HTML sémantique et accessible : lien d'évitement, un seul h1 par page, titre d'onglet et
    meta description par page, labels et `autocomplete` sur chaque champ, `aria-current` ;
  - ergonomie mobile minimale : zones tactiles de 44 px, champs à 16 px, `100dvh`, zones sûres ;
  - tests e2e (titres, ordre des sections, ancres, labels, débordement à 375 px) et audit
    d'accessibilité automatique avec `@axe-core/playwright` sur chaque route.
- Intentions de design (non appliquées) consignées dans `docs/DESIGN.md`.
- Fondations visuelles (direction B + C de `docs/DESIGN.md`) :
  - tokens Tailwind v4 (`@theme`) : palette réduite aux 7 couleurs validées, Archivo
    auto-hébergée (`@fontsource-variable/archivo`, 2 fichiers : droit et italique condensé),
    boutons pilule, espacements, focus visible adapté au fond ;
  - composants `Button` / `ButtonLink`, `Field`, `Section` (blanc, rose pâle, noir), `Card`,
    `HeroVideo` (duotone fixe, voile, poster seul si animations réduites ou lecture refusée) ;
  - hero plein écran, en-tête qui passe du blanc au noir au défilement, menu mobile replié,
    bouton « Réserver » collé en bas sur mobile, pied de page noir ; toutes les pages habillées ;
  - tests Vitest des composants et hooks, test Playwright mobile du hero.
- Maquette fonctionnelle de tous les écrans, sur une fausse base en mémoire (aucun appel
  Supabase) : couche données `src/features/*/data.ts` calquée sur les RPC et les tables ;
  parcours `/reserver` en étapes (prestation, jour et créneau portant le lieu, coordonnées avec
  honeypot, récapitulatif, confirmation avec lien d'annulation) ; états de `/annuler` ;
  espace admin (connexion, tableau de bord, RDV, disponibilités, galerie, mot de passe,
  déconnexion) avec un faux état connecté réservé au développement, absent du build de
  production (test sur un vrai build).
- Vidéo du hero : boucle de 14,6 s tirée du reel, 360×640, sans son (`public/media/`) : WebM
  AV1 (0,71 Mo) puis MP4 H.264 (1,13 Mo), poster JPEG (20 Ko). Pause quand l'onglet est caché,
  poster seul si aucune source ne se lit. Tests : attributs de la vidéo, absence de piste audio
  et poids des fichiers, aucune requête vers un autre domaine.

### Modifié

- Nom affiché du site : CutsByAlix.
- Menu : ancres vers les sections de l'accueil et lien « Réserver » ; le lien « Admin » n'est plus
  dans le menu public.

### Supprimé

- Routes `/prestations` et `/galerie` : remplacées par des sections de l'accueil.

### À venir

Identité visuelle (phase 3).
Voir [`docs/PLAN.md`](docs/PLAN.md).
