# ADR 0006 — Galerie : bucket privé, photos traitées dans le navigateur, écritures par fonctions

- **Date** : 2026-10-11
- **Statut** : accepté

## Contexte

Consigne 20 : Alix publie des photos de ses coupes depuis son iPhone ; l'accueil affiche les
photos publiées. Ces photos peuvent montrer un visage (droit à l'image) et, prises par un
téléphone, contiennent des métadonnées EXIF : position GPS, date, modèle de l'appareil.
Jusqu'ici, le bucket « gallery » était **public** (toute photo lisible par son URL, même
masquée), acceptait jpeg/png/webp jusqu'à 5 Mo sous n'importe quel nom, et `authenticated`
écrivait directement dans `gallery_items` (sous RLS admin). Le quota gratuit de Storage est
de 1 Go.

## Décision

- **Bucket privé + URL signées** (décision de Thibault du 2026-10-11). Une policy Storage
  laisse `anon` « voir » un objet seulement si sa ligne `gallery_items` lui est visible, donc
  publiée (la RLS de la table s'applique dans la sous-requête). Le site public demande, en une
  requête, une URL signée de **1 h** pour chaque photo publiée.
- **Masquer change le nom du fichier** (revue sécurité, vérifié sur la pile locale) : la durée
  d'une URL signée est choisie par l'APPELANT (anon peut demander 10 ans pour une photo
  publiée) et Storage ne relit pas la RLS quand on s'en sert. Masquer une photo publiée copie
  donc son fichier sous un nouvel uuid (API Storage), `admin_hide_gallery_item` pointe la
  ligne vers la copie, puis le front efface l'ancien fichier : toute URL déjà émise répond
  400. Si la copie échoue (réseau), la photo est masquée quand même et l'écran prévient Alix
  que d'anciens liens peuvent rester valables (supprimer la photo les coupe).
- **Traitement dans le navigateur avant l'envoi** (`src/features/gallery/processImage.ts`) :
  type annoncé ET octets d'en-tête vérifiés (JPEG, PNG, WebP ; SVG, HEIC non converti, HTML
  refusés sans décodage), orientation de l'appareil appliquée, 1200 px max sur le grand côté,
  ré-encodage par canvas en WebP, ou en JPEG quand le navigateur n'encode pas le WebP (Safari
  iOS renvoie du PNG sans prévenir). Le canvas ne contient que des pixels : aucune métadonnée
  n'est recopiée. Le fichier d'origine ne quitte jamais le téléphone. Poids final ≤ 1,5 Mo.
- **Bucket** : `image/webp` et `image/jpeg` seulement, 2 Mo. Nom imposé par la policy
  d'insertion : `<uuid v4 en minuscules>.webp|jpg` à la racine (ni dossier, ni `..`, ni nom
  d'origine), plus de policy `update` (aucun remplacement). Plafond de 65 fichiers
  (`private.gallery_bucket_has_room()`), même en appelant l'API Storage sans passer par le site.
- **Table** : `caption` remplacée par `alt_text` obligatoire (1 à 200 caractères,
  `private.is_safe_text`) ; `width` / `height` (1 à 1200) pour réserver la place ; `consent_at`
  (accord confirmé par Alix) avec la contrainte « publiée ⇒ accord daté ». `anon` ne lit que
  `id, image_path, alt_text, width, height, sort_order` ; `authenticated` n'a plus aucun droit.
- **Écritures par RPC admin** (modèle des ADR 0004 et 0005) : `admin_list_gallery_items`,
  `admin_add_gallery_item` (vérifie que le fichier existe avec le type de son extension, chemin
  unique, limite), `admin_hide_gallery_item` (masquage avec nouveau nom de fichier),
  `admin_set_gallery_item_published` (publier exige l'accord **à chaque
  fois**), `admin_update_gallery_item_alt`, `admin_move_gallery_item` (échange avec le voisin,
  renumérotation sans trou), `admin_delete_gallery_item` (renvoie le chemin),
  `admin_gallery_orphans`.
- **Limite de 60 photos**, réglable dans `private.settings().gallery_max_items` (fonction
  recréée : aucune dépendance `pg_depend`, vérifié).
- **Fichier et ligne, sans orphelin visible** : la base ne peut pas effacer un fichier
  (`storage.protect_delete`). Ordre imposé côté front : envoi du fichier PUIS ligne (fichier
  effacé si la ligne est refusée) ; ligne supprimée PUIS fichier. Une coupure réseau laisse au
  pire un fichier sans ligne, invisible du public, effacé à la prochaine ouverture de l'écran
  admin (`admin_gallery_orphans` : fichiers sans ligne de plus d'1 h). Jamais une ligne sans
  fichier, qui casserait la galerie de l'accueil.

## Alternatives étudiées

- **Bucket public, limite documentée** : plus simple et mieux mis en cache, mais une photo
  publiée puis masquée resterait lisible par quiconque a gardé son URL (et dans le cache du
  CDN). Inacceptable pour une photo dont la personne a retiré son accord.
- **Deux buckets (privé + public, copie à la publication)** : URL stables et cache efficace,
  mais deux fichiers par photo, une copie à chaque publication, et le cache du CDN garde la
  photo masquée. Plus complexe pour un gain faible.
- **Traitement côté serveur (Edge Function)** : le fichier d'origine, EXIF compris, partirait
  sur le réseau et serait traité hors du téléphone ; quota et complexité en plus.
- **Écriture directe sous RLS** : laisserait l'admin poser un chemin quelconque, publier sans
  accord ou dépasser la limite ; la base ne pourrait vérifier ni le fichier ni l'ordre.

## Conséquences

- Une requête de plus pour afficher la galerie (signature), et des URL qui changent à chaque
  visite : le cache du navigateur ne sert pas d'une visite à l'autre. Une page laissée ouverte
  plus d'1 h ne charge plus les photos encore jamais affichées (rechargement nécessaire).
- Les URL signées pointent vers `https://<ref>.supabase.co` : la future CSP devra l'autoriser
  dans `img-src` (et `connect-src`, déjà prévu).
- Le futur carrousel WebGL chargera les photos comme **textures** : il faudra l'en-tête CORS
  côté Storage (et `crossOrigin="anonymous"`), sinon le canvas WebGL est « contaminé ».
- Le droit à l'image repose sur la case cochée par Alix : la base date l'accord, elle ne
  prouve pas qu'il a été donné. Si une personne retire son accord, Alix masque ou supprime la
  photo : les liens existants sont coupés aussitôt (reste le cache du navigateur ou du CDN,
  `cacheControl` d'1 h, pour quelqu'un qui l'a déjà téléchargée).
- Risques acceptés (revue sécurité, mineurs, admin seulement) : le contenu du fichier n'est
  pas vérifié côté serveur (Storage se fie au Content-Type ; un compte admin volé pourrait
  déposer autre chose qu'une image, mais elle serait servie en `image/jpeg`/`image/webp`
  depuis le domaine de Supabase, jamais en SVG ni en HTML) ; le plafond de 65 fichiers est
  compté sans verrou (1 ou 2 fichiers de plus au pire).
- Safari iOS envoie du JPEG, les autres navigateurs du WebP : les deux formats coexistent.
- Tests : pgTAP 15 (date fixe : chemins, types, limite, plafond, accord, ordre, orphelins,
  droits), Vitest (traitement d'image, couche données, écrans), Playwright sur les 3 projets
  (photo dessinée par canvas avec un EXIF fabriqué : orientation 6 + GPS ; on vérifie qu'elle
  part redressée, en 800 × 1200, sans aucune trace EXIF, sous un nom uuid).
