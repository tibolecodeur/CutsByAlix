# Décisions de design

> Rempli au fur et à mesure, uniquement à partir de mes consignes. Claude n'ajoute rien ici
> sans que je l'aie validé.
>
> **Validé** = décision définitive, à appliquer dans le code (phase 3). **Intention, non
> appliquée** = direction souhaitée, pas encore précisée.

## Direction retenue

Mélange des propositions B « Plein jour » et C « Duotone » (`/direction-artistique`, 2026-10-08).
Depuis le 2026-10-13 (consigne 27, version finale) : vitrine sombre, orange dominant (l'action),
rose secondaire (la voix), halos et verre dépoli utilisés avec retenue ; pages outil en blanc
cassé, sobres. Le hero reprend le principe de noclout.fr (vidéo plein écran, marque au centre,
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

Rôles redéfinis le 2026-10-13 (consigne 27, version finale) : une dominante, une secondaire,
une base neutre.

| Rôle                        | Hex                   | Usage                                                                                                                |
| --------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Base vitrine                | `#111111`             | fond de tout l'accueil (d'un seul tenant avec le hero), pied de page                                                 |
| Base pages outil            | `#F7F7F5`             | fond de /reserver, /annuler, pages légales, admin (blanc cassé froid)                                                |
| Surface                     | `#FFFFFF`             | champs, choix, cartes et encadrés posés sur le blanc cassé                                                           |
| Texte                       | `#111111` / `#FFFFFF` | noir sur clair, blanc sur noir ; secondaire : gris `#5C5C5C` sur clair, blanc à 75 % sur noir                        |
| **Dominante : orange**      | `#FF6A1A`             | l'ACTION : boutons principaux (texte noir), prix et numéros d'étapes en grands chiffres sur noir, halos, choix coché |
| **Secondaire : rose**       | `#FFD9E6`             | la VOIX sur noir : grands titres de l'accueil, liens                                                                 |
| **Secondaire : rose foncé** | `#C2185B`             | la VOIX sur clair : liens ; lumière des halos sur noir ; barre des messages d'erreur                                 |

**Interdit** : orange en texte sur fond clair (2,67) ; texte blanc sur orange (2,87) ; chiffres
orange sur un halo orange (2,63) ; gris secondaire ou rose foncé en texte sur noir ; rose pâle
en aplat de section.

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

Version finale (consigne 27), calculée le 2026-10-13. Halos à 45 % (orange) et 50 % (rose
foncé) sur noir ; verre = blanc à 5 % par-dessus. Valeurs au cœur des halos (pire cas) :

| Texte / fond                            | Ratio | AA                                         |
| --------------------------------------- | ----- | ------------------------------------------ |
| `#111111` / `#F7F7F5`                   | 17,60 | oui                                        |
| `#5C5C5C` / `#F7F7F5`                   | 6,23  | oui                                        |
| `#C2185B` / `#F7F7F5` (liens sur clair) | 5,48  | oui                                        |
| `#FFD9E6` / `#111111` (titres, liens)   | 14,67 | oui                                        |
| `#111111` / `#FF6A1A` (boutons)         | 6,59  | oui                                        |
| `#FF6A1A` / `#111111` (grands chiffres) | 6,59  | oui                                        |
| orange / verre sur halo rose            | 3,69  | oui en grand texte (prix, numéros : 60 px) |
| orange / verre sur halo orange          | 2,63  | **non** : jamais de chiffres orange là     |
| blanc / verre sur halo orange           | 7,55  | oui                                        |
| blanc à 75 % / verre sur halo orange    | 5,04  | oui                                        |
| rose pâle / halo orange                 | 6,65  | oui                                        |
| `#FFFFFF` / `#FF6A1A`                   | 2,87  | **non** : jamais de texte blanc sur orange |

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
- **Hero** : vidéo plein écran (`100svh`, hauteur stable pendant le défilement), noir et blanc
  teintée rose → orange (duotone CSS fixe, non animé), voile sombre par-dessus, logo blanc
  centré, menu blanc par-dessus. Le voile garantit le contraste du texte blanc (au moins 4,5).
- **Vitrine** _(2026-10-13, consigne 27, version finale)_ : tout l'accueil sur noir, d'un seul
  tenant avec le hero. Chaque section est rythmée par des halos (dégradés radiaux statiques,
  orange et rose foncé), ancrés en haut, en bas ou au centre et jamais coupés à un bord.
  Grands titres en capitales condensées rose pâle (`title-section`). Sections aérées
  (4,5 rem mobile, 7 rem desktop), colonne large de 64 rem sur desktop.
- **Verre dépoli** (`backdrop-filter`), à trois endroits seulement : en-tête une fois le hero
  passé (sombre sur l'accueil, clair ailleurs), dock du bouton « Réserver » sur mobile,
  panneaux posés sur les halos (tarifs, lieu). Toujours statique. Repli opaque si
  `backdrop-filter` n'est pas supporté ou si la transparence est réduite. Mesuré : 60 images/s
  au défilement à 375 px, processeur bridé ×4.
- **Pages outil** (/reserver, /annuler, légal, admin) : blanc cassé, sans halo ; l'orange
  n'y apparaît que sur les boutons, le rose foncé sur les liens.
- **Prestations** : grille tarifaire façon tableau de salon sur un panneau de verre,
  « COUPE ········ 10 € », prix en grands chiffres orange (sur le halo rose).
- **Comment réserver** : grands numéros orange « 01 02 03 » (sur le halo rose), lieu sur un
  panneau de verre.
- **Mobile** : un seul bouton « Réserver » orange, dans un dock de verre collé en bas de
  l'écran (zones sûres `env(safe-area-inset-bottom)`).
- **Galerie** : carrousel horizontal en CSS `scroll-snap` (composant isolé et remplaçable,
  `GalleryCarousel`), photos en noir et blanc aux angles arrondis, boutons précédente /
  suivante de 52 px. Vue détail en couleur : non faite.
- **Formes** : tout ce qui est interactif en pilule ; panneaux arrondis à 1,75 rem ; photos à
  1 rem.
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

- **Flou** : halos (dégradés radiaux) et verre dépoli, statiques, jamais animés (voir Mise en
  page). _(validé le 2026-10-13, consigne 27)_

_Aucune librairie d'animation installée pour l'instant._

## Historique des décisions

| Date       | Décision                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Nom CutsByAlix. Intentions (non appliquées) : logo 3 lignes, ton professionnel, rose / orange + gris / blanc, accueil long avec grande photo, loader ciseaux ou tondeuse.                                                                                                                                                                   |
| 2026-10-08 | Direction B + C : fond blanc, sections rose pâle et blocs noirs, Archivo auto-hébergée, boutons pilule orange, hero vidéo duotone, galerie N&B → couleur. Logo texte provisoire (TODO).                                                                                                                                                     |
| 2026-10-08 | Boutons principaux en rose pâle `#FFD9E6`, texte et contour noirs (au lieu de l'orange). L'orange ne sert plus qu'au duotone du hero.                                                                                                                                                                                                       |
| 2026-10-08 | Vidéo du hero (consigne 11 bis) : boucle de 14,6 s tirée du reel, 360×640 (résolution de la source), WebM AV1 0,71 Mo + MP4 H.264 1,13 Mo + poster 20 Ko. Remplace « 6 s max, ~1,5 Mo ».                                                                                                                                                    |
| 2026-10-13 | Design v1 (consigne 27), version finale : vitrine sur noir d'un seul tenant avec le hero (100svh), orange dominant (boutons à texte noir, grands chiffres), rose secondaire (titres et liens), halos et verre dépoli avec repli opaque ; pages outil en blanc cassé. Remplace le fond continu dégradé puis la version fonds unis sans rose. |
