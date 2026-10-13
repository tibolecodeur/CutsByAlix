# Décisions de design

> Rempli au fur et à mesure, uniquement à partir de mes consignes. Claude n'ajoute rien ici
> sans que je l'aie validé.
>
> **Validé** = décision définitive, à appliquer dans le code (phase 3). **Intention, non
> appliquée** = direction souhaitée, pas encore précisée.

## Direction retenue

Mélange des propositions B « Plein jour » et C « Duotone » (`/direction-artistique`, 2026-10-08).
Depuis le 2026-10-13 (consigne 27, version blanche) : arrivée sur la vidéo, puis un site blanc
aux couleurs orange et rose, avec une signature de barbier (rayures du poteau) ; même thème sur
toutes les pages, admin compris. Le hero reprend le principe de noclout.fr (vidéo plein écran, marque au centre,
menu par-dessus), adapté à nos couleurs : on n'en copie pas l'identité.

## Identité (nom, logo, ton)

- Nom affiché : **CutsByAlix**. _(appliqué : textes du site)_
- Logo : texte en capitales très grasses, condensées et inclinées, sur 3 lignes
  **CUTS / BY / ALIX**, blanc, sur photo noir et blanc. _(validé)_
- **TODO logo** : en attendant le logo en HD ou SVG, logo texte provisoire « CUTS BY ALIX » en
  Archivo (très condensé, extra-gras, italique), blanc. À remplacer dès réception du fichier.
- Ton des textes : « salon », rassurant et professionnel. Phrases courtes et claires,
  tutoiement. Exemple : « Réserve ta coupe en une minute. » _(validé)_

## Couleurs _(validé)_

Rôles redéfinis le 2026-10-13 (consigne 27, version blanche) : fond blanc partout, orange et
rose comme couleurs principales.

| Rôle                        | Hex       | Usage                                                                                             |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| Fond                        | `#FFFFFF` | toutes les pages : vitrine, réservation, pages légales, admin                                     |
| Texte                       | `#111111` | texte courant, titres, contours ; secondaire : gris `#5C5C5C`                                     |
| **Principale : orange**     | `#FF6A1A` | l'ACTION : boutons principaux (texte noir), pastilles d'étapes, jour choisi, progression, rayures |
| **Principale : rose foncé** | `#C2185B` | la VOIX : prix en grands chiffres, liens, rayures ; barre des messages d'erreur                   |
| **Principale : rose pâle**  | `#FFD9E6` | la DOUCEUR : une bande de fond par page au plus (galerie), choix coché, étiquettes de durée       |
| Texte sur la vidéo          | `#FFFFFF` | hero uniquement                                                                                   |

**Signature « poteau de barbier »** : rayures diagonales orange / blanc / rose foncé
(`bg-barber`), en bande fine : sous la vidéo, en tête de la carte des tarifs, sous chaque titre,
en haut du pied de page. Jamais animée.

**Interdit** : orange en texte sur blanc (2,87) ; texte blanc sur orange (2,87) ; rose pâle en
texte ; plus d'une bande rose pâle par page.

### Contrastes vérifiés (WCAG 2.1, AA = 4,5 texte normal, 3 grand texte)

| Texte / fond          | Ratio | AA texte normal                                |
| --------------------- | ----- | ---------------------------------------------- |
| `#111111` / `#FFFFFF` | 18,88 | oui                                            |
| `#111111` / `#FFD9E6` | 14,67 | oui                                            |
| `#5C5C5C` / `#FFFFFF` | 6,69  | oui                                            |
| `#5C5C5C` / `#FFD9E6` | 5,20  | oui                                            |
| `#111111` / `#FF6A1A` | 6,59  | oui                                            |
| `#C2185B` / `#FFFFFF` | 5,87  | oui                                            |
| `#C2185B` / `#FFD9E6` | 4,56  | oui (de justesse, d'où le gras)                |
| `#FFFFFF` / `#111111` | 18,88 | oui                                            |
| `#FFD9E6` / `#111111` | 14,67 | oui                                            |
| `#C2185B` / `#111111` | 3,22  | **non** : pas de rose foncé sur bloc noir      |
| `#5C5C5C` / `#111111` | 2,82  | **non** : pas de gris secondaire sur bloc noir |

Version blanche (consigne 27), calculée le 2026-10-13 :

| Texte / fond                               | Ratio | AA                                   |
| ------------------------------------------ | ----- | ------------------------------------ |
| `#111111` / `#FFFFFF`                      | 18,88 | oui                                  |
| `#5C5C5C` / `#FFFFFF`                      | 6,69  | oui                                  |
| `#C2185B` / `#FFFFFF` (prix, liens)        | 5,87  | oui                                  |
| `#111111` / `#FFD9E6` (galerie)            | 14,67 | oui                                  |
| `#5C5C5C` / `#FFD9E6`                      | 5,20  | oui                                  |
| `#C2185B` / `#FFD9E6` (liens, en gras)     | 4,56  | oui, de justesse : liens en gras     |
| `#111111` / `#FF6A1A` (boutons, pastilles) | 6,59  | oui                                  |
| `#FF6A1A` / `#FFFFFF`                      | 2,87  | **non** : jamais d'orange en texte   |
| `#FFFFFF` / `#FF6A1A`                      | 2,87  | **non** : jamais de blanc sur orange |

**Bouton principal (2026-10-13, remplace le rose pâle du 2026-10-08)** : fond orange `#FF6A1A`,
texte `#111111` (6,59), bordure orange (même hauteur que le bouton secondaire, sans contour
décoratif).

## Typographies _(validé)_

- **Archivo** (police variable, licence SIL OFL), une seule famille pour tout le site.
  - Titres et logo provisoire : très condensé, extra-gras, italique (axes `wdth` bas, `wght`
    800–900, `ital`).
  - Texte courant, champs, boutons : largeur normale, graisse normale à semi-grasse.
- Auto-hébergée (paquet `@fontsource-variable/archivo`), jamais chargée depuis un CDN externe
  (RGPD).
- Champs de formulaire à 16 px minimum.

## Mise en page _(validé)_

- Page d'accueil longue (une seule page à sections).
- **Hero** : vidéo plein écran (`100svh`), noir et blanc teintée rose → orange (duotone CSS
  fixe), voile sombre, logo blanc centré, bouton « Réserver » orange. Inchangé.
- **Sous la vidéo** _(2026-10-13, consigne 27, version blanche)_ : bande de barbier pleine
  largeur, puis fond blanc. Accueil : Prestations (blanc), Galerie (bande rose pâle), Comment
  réserver (blanc), pied de page blanc ouvert par la bande de barbier.
- **Titres** : capitales condensées italiques extra-grasses (`title-section` sur l'accueil, `h1`
  ailleurs), suivis d'une courte bande de barbier. Jamais de césure automatique dans un grand
  titre.
- **Pages hors accueil** : en-tête commun (`PageHeader` : titre, bande de barbier, accroche).
  Même gabarit pour réserver, annuler, conditions, pages légales, 404.
- **En-tête** : transparent sur la vidéo, puis verre dépoli blanc (repli opaque si
  `backdrop-filter` n'est pas supporté). Seul effet de flou du site.
- **Prestations** : carte des tarifs façon enseigne de salon (contour noir, bande de barbier en
  tête), « COUPE ······ 10 € », prix en grands chiffres rose foncé, durée en étiquette rose
  pâle.
- **Comment réserver** : frise de pastilles orange numérotées reliées par un filet orange ;
  carte « Le lieu » rose très pâle avec le contact Instagram.
- **Réservation** : progression orange, jour choisi en orange, choix coché en rose pâle avec
  filet orange, récapitulatif en carte.
- **Mobile** : un seul bouton « Réserver » orange collé en bas de l'écran, ombre teintée
  d'orange (zones sûres `env(safe-area-inset-bottom)`).
- **Galerie** : carrousel horizontal en CSS `scroll-snap` (composant isolé et remplaçable,
  `GalleryCarousel`), grandes photos 4:5 en noir et blanc aux angles arrondis, la suivante
  dépasse au bord. Pagination : pastilles (la photo en cours en pilule orange) à partir de md,
  compteur « 2 / 7 » sur mobile ; flèches de 52 px. Photos : uniquement celles publiées par
  l'admin (aucun repli) ; les 7 photos de la vitrine (`public/media/galerie/`) s'importent en
  un geste depuis /admin/galerie. Vue détail en couleur : non faite.
- **Admin galerie** : aperçu « Sur le site » (photos publiées, dans l'ordre du carrousel,
  pastille orange numérotée) ; carte : Publier / Masquer et Modifier en premier, ordre dans un
  tiroir « Changer l'ordre » (Monter / Descendre, En premier / En dernier au-delà de 2 photos),
  Supprimer en lien rose foncé ; statut en pilule.
- **Formes** : pilule pour ce qui se touche (boutons, étiquettes) ; cartes 1,5 rem ; champs,
  choix et jours 0,75 rem ; photos 1 rem.
- **Espacement** : sections de l'accueil aérées (4,5 rem mobile, 7 rem desktop), colonne
  large de 64 rem sur desktop ; formulaires, pages légales et admin en colonne de 48 rem.
- **Vidéo du hero** _(appliqué le 2026-10-08, consigne 11 bis)_ :
  `autoplay muted loop playsinline`, `preload="metadata"`, avec image `poster` ; seul le poster s'affiche si
  `prefers-reduced-motion`, si la lecture automatique est refusée ou si aucune source ne se
  lit. Pause quand l'onglet est caché. Tout est servi par notre domaine (`public/media/`).
  - Source : `media-source/reel.mp4` (hors git, jamais versionné), reel de 55,9 s,
    360×640, 60 fps, 28,3 Mo, avec son.
  - Boucle : 5,333 → 19,95 s de la source (14,6 s : ciseaux, tondeuse, dégradé en gros plan),
    coupée pile sur deux coupes du montage. Aucun raccord image sur image n'existe dans le
    reel ; le retour au début se lit comme une coupe de plus. Pas de fondu enchaîné.
  - Résolution : 360×640, celle de la source. Pas d'agrandissement à 720 px (2,8 Mo au lieu
    de 1,1 Mo pour aucun détail en plus). À réencoder si une source HD est fournie.
  - Formats, par ordre de préférence :

    | Fichier           | Format                                                          | Poids   |
    | ----------------- | --------------------------------------------------------------- | ------- |
    | `hero.webm`       | AV1 (SVT-AV1, CRF 32), 30 fps, sans son                         | 0,71 Mo |
    | `hero.mp4`        | H.264 High 3.1, yuv420p, CRF 21, 30 fps, sans son, `+faststart` | 1,13 Mo |
    | `hero-poster.jpg` | JPEG 360×640, 1ʳᵉ image de la boucle                            | 20 Ko   |

    AV1 retenu plutôt que VP9 : à qualité égale (SSIM 0,986, comme le MP4), 0,71 Mo contre
    environ 1,2 Mo en VP9 (estimé entre deux essais : 0,75 Mo à SSIM 0,980, 1,5 Mo à
    0,988). Les navigateurs sans AV1 (la plupart des iPhone) prennent le MP4.

  - Desktop : la vidéo verticale est recadrée (`object-fit: cover`, centrée). En 1280×800,
    seule la bande centrale de 35 % de la hauteur reste visible.

## Composants (boutons, cartes, champs…)

- **Boutons** : forme pilule (entièrement arrondis), hauteur 52 px minimum. Principal : fond
  orange `#FF6A1A`, texte `#111111`. _(validé le 2026-10-13, consigne 27 ; remplace le rose pâle
  à contour noir du 2026-10-08)_. Choix coché d'un formulaire : filet orange à gauche.
- **Champs** : _à préciser au moment de coder les composants._

## Animations et effets

- Loader avec une animation de ciseaux ou de tondeuse, à voir plus tard : court, à la première
  visite seulement, désactivé si `prefers-reduced-motion`. _(intention, non appliquée)_

- **Flou** : uniquement l'en-tête en verre dépoli, statique. _(validé le 2026-10-13, consigne 27)_

_Aucune librairie d'animation installée pour l'instant._

## Historique des décisions

| Date       | Décision                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Nom CutsByAlix. Intentions (non appliquées) : logo 3 lignes, ton professionnel, rose / orange + gris / blanc, accueil long avec grande photo, loader ciseaux ou tondeuse.                                                                                                                                              |
| 2026-10-08 | Direction B + C : fond blanc, sections rose pâle et blocs noirs, Archivo auto-hébergée, boutons pilule orange, hero vidéo duotone, galerie N&B → couleur. Logo texte provisoire (TODO).                                                                                                                                |
| 2026-10-08 | Boutons principaux en rose pâle `#FFD9E6`, texte et contour noirs (au lieu de l'orange). L'orange ne sert plus qu'au duotone du hero.                                                                                                                                                                                  |
| 2026-10-08 | Vidéo du hero (consigne 11 bis) : boucle de 14,6 s tirée du reel, 360×640 (résolution de la source), WebM AV1 0,71 Mo + MP4 H.264 1,13 Mo + poster 20 Ko. Remplace « 6 s max, ~1,5 Mo ».                                                                                                                               |
| 2026-10-13 | Design v1 (consigne 27), version blanche : fond blanc sur tout le site (admin compris), orange et rose en couleurs principales, signature « poteau de barbier », carte des tarifs façon enseigne, en-tête commun des pages. Remplace les versions précédentes de la consigne 27 (dégradé, fonds unis, vitrine sombre). |
