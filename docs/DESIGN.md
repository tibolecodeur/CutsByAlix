# Décisions de design

> Rempli au fur et à mesure, uniquement à partir de mes consignes. Claude n'ajoute rien ici
> sans que je l'aie validé.
>
> **Validé** = décision définitive, à appliquer dans le code (phase 3). **Intention, non
> appliquée** = direction souhaitée, pas encore précisée.

## Direction retenue

Mélange des propositions B « Plein jour » et C « Duotone » (`/direction-artistique`, 2026-10-08).
Base claire et propre, ambiance « salon » rassurante, avec des sections rose pâle et quelques
blocs noirs. Le hero reprend le principe de noclout.fr (vidéo plein écran, marque au centre,
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

| Rôle                 | Hex       | Usage                                                        |
| -------------------- | --------- | ------------------------------------------------------------ |
| Fond principal       | `#FFFFFF` | sections blanches                                            |
| Fond alterné         | `#FFD9E6` | sections rose pâle, en alternance avec le blanc              |
| Blocs sombres        | `#111111` | quelques blocs noirs ponctuels                               |
| Texte                | `#111111` | texte courant, titres, texte et contour des boutons          |
| Texte secondaire     | `#5C5C5C` | légendes, durées, aides de champ (sur fond clair uniquement) |
| Action principale    | `#FFD9E6` | fond des boutons principaux, texte et contour `#111111`      |
| Orange               | `#FF6A1A` | duotone du hero uniquement (plus utilisé pour les boutons)   |
| Liens et accents     | `#C2185B` | liens, accents texte ; **en gras** sur le rose pâle          |
| Texte sur bloc noir  | `#FFFFFF` | texte courant sur `#111111`                                  |
| Accent sur bloc noir | `#FFD9E6` | liens (soulignés) et texte secondaire sur `#111111`          |

**Interdit** : texte orange sur fond clair (2,87 sur blanc, 2,23 sur rose pâle).

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

**Bouton principal (2026-10-08)** : fond rose pâle `#FFD9E6`, texte `#111111` (14,67), contour
`#111111` de 2 px. Sans contour, le bouton disparaîtrait sur les sections rose pâle (même
couleur) et se verrait à peine sur le blanc ; le contour noir contraste à 14,67 sur rose pâle et
18,88 sur blanc. Le point ouvert sur le contraste du fond orange est donc clos.

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
- **Hero** : vidéo plein écran (`100dvh`), noir et blanc teintée rose → orange (duotone CSS
  fixe, non animé), voile sombre par-dessus, logo blanc centré, menu blanc par-dessus.
  Au défilement, le menu passe en noir sur fond clair. Le voile doit garantir le contraste du
  texte blanc (au moins 4,5) quel que soit l'image de la vidéo.
- Sections suivantes en alternance blanc / rose pâle `#FFD9E6`, avec quelques blocs noirs
  `#111111`.
- **Mobile** : un seul bouton « Réserver » rose pâle collé en bas de l'écran (zones sûres
  `env(safe-area-inset-bottom)`).
- **Galerie** : photos en noir et blanc dans la grille, en couleur dans la vue détail.
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
  `#FFD9E6`, texte `#111111`, contour `#111111` de 2 px. _(validé le 2026-10-08, remplace
  l'orange)_
- **Champs** : _à préciser au moment de coder les composants._

## Animations et effets

- Loader avec une animation de ciseaux ou de tondeuse, à voir plus tard : court, à la première
  visite seulement, désactivé si `prefers-reduced-motion`. _(intention, non appliquée)_

_Aucune librairie d'animation installée pour l'instant._

## Historique des décisions

| Date       | Décision                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Nom CutsByAlix. Intentions (non appliquées) : logo 3 lignes, ton professionnel, rose / orange + gris / blanc, accueil long avec grande photo, loader ciseaux ou tondeuse.                |
| 2026-10-08 | Direction B + C : fond blanc, sections rose pâle et blocs noirs, Archivo auto-hébergée, boutons pilule orange, hero vidéo duotone, galerie N&B → couleur. Logo texte provisoire (TODO).  |
| 2026-10-08 | Boutons principaux en rose pâle `#FFD9E6`, texte et contour noirs (au lieu de l'orange). L'orange ne sert plus qu'au duotone du hero.                                                    |
| 2026-10-08 | Vidéo du hero (consigne 11 bis) : boucle de 14,6 s tirée du reel, 360×640 (résolution de la source), WebM AV1 0,71 Mo + MP4 H.264 1,13 Mo + poster 20 Ko. Remplace « 6 s max, ~1,5 Mo ». |
