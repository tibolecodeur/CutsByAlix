# ADR 0013 — Versions saisonnières du site (Noël)

- **Date** : 2026-11-05
- **Statut** : proposé (rendu à valider par Thibault avant de l'inscrire dans docs/DESIGN.md)

## Contexte

Thibault veut une version de Noël du site, **distincte** de la version de base et
**réutilisable chaque année**, qu'on peut mettre ou enlever sans repasser sur le code à chaque
fin de saison. Il a choisi lui-même les sources des décors (2026-11-05) : **React Bits**
(composant PixelSnow, transformé en neige de petits ciseaux) et **LottieFiles** (animations).
Une première version faite d'icônes et d'emoji rapportés a été abandonnée : un assemblage sans
unité.

## Décision

**Une saison est une couche posée par-dessus la version de base**, jamais une copie du site.

- `src/lib/season.ts` choisit la saison au chargement et la pose sur `<html data-season="…">`.
  Du plus fort au plus faible :
  1. `?saison=noel` ou `?saison=base` dans l'adresse : aperçu, à tout moment ;
  2. `VITE_SEASON` au build (Cloudflare Pages) : `base` coupe Noël, `noel` le force ;
  3. sinon (`auto`) : le calendrier, en heure de Paris. Noël : **du 1er décembre au 6 janvier**,
     chaque année, sans rien toucher.
- `src/seasons/noel/` contient tout Noël. Points d'accroche dans la version de base derrière
  `CURRENT_SEASON === "noel"`, code de Noël chargé à part (import dynamique) : la version de
  base n'en télécharge pas une ligne.
- **Neige de ciseaux** (`ScissorSnow.tsx` + `scissorSnow.ts`) : adaptée de **PixelSnow (React
  Bits, licence MIT + Commons Clause)**. Même physique (5 plans de profondeur, vent,
  balancement, apparition par le haut, écart au passage du pointeur, pause hors écran) ; à la
  demande de Thibault, de **petits ciseaux normaux** (dessin vectoriel des ciseaux de Lucide,
  ISC) **mêlés de flocons à 6 branches** (40 %, réglable : `flakeShare`), qui tournent en
  tombant, au lieu de cristaux en pixels. Canvas 2D plutôt que WebGL :
  une image par plan préparée une fois, puis seulement déplacée et tournée ; au plus 220
  éléments (une quarantaine sur un téléphone). Animations réduites : image fixe.
- **Animations LottieFiles** : en attente. `lottiefiles.com` et `lottie.host` sont refusés par
  la politique réseau de l'environnement cloud ; à intégrer dès que les fichiers sont
  disponibles (domaine autorisé, ou fichiers `.lottie` / `.json` fournis). Lecteur prévu : le
  plus léger possible, chargé seulement en saison.

## Alternatives étudiées

- **Modifier le site en décembre, puis revenir en arrière** : ce que Thibault ne veut pas.
- **Branche Git « noel » à déployer** : deux sites à maintenir.
- **PixelSnow tel quel (WebGL)** : cristaux en pixels, pas des ciseaux ; WebGL 2 plus lourd à
  initialiser sur un téléphone d'entrée de gamme.
- **Interrupteur dans l'espace admin** : demanderait une migration et une revue sécurité ; le
  calendrier automatique suffit pour l'instant.

## Conséquences

- Ajouter une saison : un dossier `src/seasons/<nom>/`, une période dans `SEASON_PERIODS`.
- Supprimer Noël pour de bon : supprimer `src/seasons/noel/` et ses lignes `noel &&`.
- La neige est une animation en canvas (et non en `transform` / `opacity` CSS, règle de
  docs/DESIGN.md) : écart validé par Thibault en demandant ce composant ; elle respecte
  `prefers-reduced-motion` et s'arrête hors écran.
- Tests figés en version de base (`VITE_SEASON=base`) ; Noël a ses tests
  (`src/seasons/noel/*.test.*`, `e2e/saison-noel.spec.ts`).
