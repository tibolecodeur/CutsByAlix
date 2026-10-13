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

| Rôle                                                                                         | Hex | Usage |
| -------------------------------------------------------------------------------------------- | --- | ----- |
| Rôles mis à jour le 2026-10-13 (consigne 27) : fond continu, orange sur toute la page, liens |
| noirs soulignés de rose foncé.                                                               |

| Rôle                 | Hex       | Usage                                                                                                                   |
| -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Fond continu         | `#FFFFFF` | dégradé vertical blanc / rose pâle sous toute la page (un seul calque, aucune section ne peint son fond)                |
| Fond continu         | `#FFD9E6` | idem, en alternance fondue avec le blanc                                                                                |
| Blocs sombres        | `#111111` | galerie et pied de page, entrés et sortis par un fondu orange (« crépuscule »)                                          |
| Texte                | `#111111` | texte courant, titres, liens, texte et contour des boutons, chiffres sur pastille orange                                |
| Texte secondaire     | `#5C5C5C` | légendes, aides de champ (sur fond clair uniquement)                                                                    |
| Action principale    | `#FFD9E6` | fond des boutons principaux, texte et contour `#111111`                                                                 |
| Orange               | `#FF6A1A` | duotone du hero, halos du fond (10 % max), fondus « crépuscule », pastilles (durées, étapes), marqueurs « à compléter » |
| Accent rose foncé    | `#C2185B` | souligné épais des liens, barre des messages d'erreur ; en texte : seulement sur blanc pur (encadré d'erreur)           |
| Texte sur bloc noir  | `#FFFFFF` | texte courant sur `#111111`                                                                                             |
| Accent sur bloc noir | `#FFD9E6` | liens (texte et souligné) sur `#111111`                                                                                 |

**Interdit** : texte orange, quel que soit le fond (2,87 sur blanc, 2,23 sur rose pâle). Texte
rose foncé ou gris sur une zone orange saturée (fondus, pastilles) : seul le noir y est posé.

**Pourquoi des liens noirs** : sur le fond continu, un halo orange à 10 % sur le rose pâle fait
tomber le rose foncé à 4,19 (sous l'AA). Le noir y reste à 13,49 ; la couleur passe dans le
souligné, décoratif.

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

Fond continu, pire cas (cœur d'un halo orange sur le rose pâle), calculé le 2026-10-13 :

| Texte / fond                        | Ratio | AA texte normal                              |
| ----------------------------------- | ----- | -------------------------------------------- |
| `#111111` / rose pâle + 10 % orange | 13,49 | oui                                          |
| `#5C5C5C` / rose pâle + 10 % orange | 4,78  | oui                                          |
| `#C2185B` / rose pâle + 10 % orange | 4,19  | **non** : d'où les liens noirs               |
| `#111111` / rose pâle + 25 % orange | 11,87 | oui (marqueurs « À COMPLÉTER »)              |
| `#5C5C5C` / rose pâle + 20 % orange | 4,39  | **non** : les halos ne dépassent jamais 10 % |

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
- **Fond continu** _(appliqué le 2026-10-13, consigne 27)_ : plus de bandes. Un seul calque
  sous toute la page (`bg-flow` sur `<main>`) : dégradé vertical rose pâle / blanc en fondu,
  et quatre halos orange (10 % max) alternés à droite et à gauche. Fixe, jamais animé.
- **Blocs noirs « crépuscule »** : la galerie et le pied de page entrent (et la galerie sort)
  par un fondu clair → orange → noir de 6 rem, qui reprend la rampe du duotone du hero. Le
  hero se fond dans la page par la rampe inverse (voile → orange → rose pâle). Aucun texte
  dans les fondus.
- **Prestations** : grille tarifaire façon tableau de salon, « Coupe ········ 10 € » (points de
  conduite), durée en pastille orange à texte noir.
- **Comment réserver** : étapes numérotées dans des pastilles orange, chiffres noirs.
- **Mobile** : un seul bouton « Réserver » rose pâle collé en bas de l'écran (zones sûres
  `env(safe-area-inset-bottom)`).
- **Galerie** : carrousel horizontal en CSS `scroll-snap` (composant isolé et remplaçable,
  `GalleryCarousel`), photos en noir et blanc, boutons précédente / suivante de 52 px. Vue
  détail en couleur : non faite.
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

| Date       | Décision                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Nom CutsByAlix. Intentions (non appliquées) : logo 3 lignes, ton professionnel, rose / orange + gris / blanc, accueil long avec grande photo, loader ciseaux ou tondeuse.                                                                            |
| 2026-10-08 | Direction B + C : fond blanc, sections rose pâle et blocs noirs, Archivo auto-hébergée, boutons pilule orange, hero vidéo duotone, galerie N&B → couleur. Logo texte provisoire (TODO).                                                              |
| 2026-10-08 | Boutons principaux en rose pâle `#FFD9E6`, texte et contour noirs (au lieu de l'orange). L'orange ne sert plus qu'au duotone du hero.                                                                                                                |
| 2026-10-08 | Vidéo du hero (consigne 11 bis) : boucle de 14,6 s tirée du reel, 360×640 (résolution de la source), WebM AV1 0,71 Mo + MP4 H.264 1,13 Mo + poster 20 Ko. Remplace « 6 s max, ~1,5 Mo ».                                                             |
| 2026-10-13 | Design v1 (consigne 27) : fond continu dégradé (plus de bandes), orange sur toute la page (halos, fondus « crépuscule » autour des blocs noirs, pastilles), liens noirs soulignés de rose foncé, grille tarifaire, galerie en carrousel scroll-snap. |
