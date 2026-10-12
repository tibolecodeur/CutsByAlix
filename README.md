# Site barber — réservation en ligne

Site vitrine et réservation de créneaux pour un barber étudiant. Les clients réservent **sans
créer de compte** ; le barber publie ses disponibilités et ses créations depuis un espace admin
pensé pour le téléphone. Paiement **sur place, en liquide** : aucun paiement en ligne.

> Projet en cours. Avancement détaillé dans [`docs/PLAN.md`](docs/PLAN.md),
> cahier des charges dans [`docs/SPEC.md`](docs/SPEC.md).

## Fonctionnalités

| Côté client                               | Côté barber (admin)                   |
| ----------------------------------------- | ------------------------------------- |
| Voir les prestations et les tarifs        | Publier ses plages de disponibilité   |
| Parcourir la galerie des créations        | Consulter et annuler les rendez-vous  |
| Réserver un créneau en moins d'une minute | Gérer la galerie depuis son téléphone |
| Annuler via un lien personnel             | Activer / désactiver des prestations  |

## Stack

| Besoin                          | Outil                                | Pourquoi                                                            |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Build et serveur de dev         | **Vite 8**                           | Démarrage instantané, build optimisé                                |
| Interface                       | **React 19** + **TypeScript** strict | Composants réutilisables, erreurs attrapées à la compilation        |
| Routage                         | **React Router 8**                   | Navigation sans rechargement de page                                |
| Styles                          | **Tailwind CSS v4** (plugin Vite)    | Styles au plus près du markup, zéro CSS mort                        |
| Composants                      | **shadcn/ui**                        | Code copié dans le projet, donc modifiable                          |
| Base de données, auth, fichiers | **Supabase** (PostgreSQL)            | Contrainte d'exclusion anti-double-réservation, RLS, offre gratuite |
| Validation                      | **Zod** + **react-hook-form**        | Un seul schéma pour le formulaire et les données                    |
| Dates                           | **date-fns** (locale `fr`)           | Manipulation de dates sans fuseau implicite                         |
| Tests unitaires                 | **Vitest** + **Testing Library**     | Même moteur que Vite, tests de composants                           |
| Tests end-to-end                | **Playwright**                       | Parcours réels sur Chromium et WebKit (Safari), mobile et desktop   |
| Tests SQL                       | **pgTAP**                            | Prouver que l'anonyme ne peut pas lire les réservations             |
| Qualité                         | **ESLint** + **Prettier**            | Règles et formatage homogènes                                       |
| Hébergement                     | **Cloudflare Pages**                 | Gratuit, en-têtes de sécurité, aperçus https (docs/DEPLOIEMENT.md)  |

shadcn/ui n'est pas encore initialisé : son CLI impose de choisir un preset qui embarque une
police, un jeu d'icônes et un thème. Cette décision appartient à la phase 3 (identité visuelle).
Aucune librairie d'animation ou de 3D n'est installée : ce choix est reporté à la phase 7.
Voir [`docs/adr/0001-choix-de-la-stack.md`](docs/adr/0001-choix-de-la-stack.md) pour le détail
des alternatives écartées.

## Installation

Prérequis : **Node.js 22+**, npm, et **Docker** (base Supabase locale).

```bash
git clone <url-du-depot>
cd site-barber
npm ci        # installe exactement package-lock.json (dont la CLI Supabase)

# Variables d'environnement : seule la clé « anon » (publique) va ici.
cp .env.example .env.local
# puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
# (Supabase > Project Settings > API). Sans elles, le site démarre quand même et affiche
# « Impossible de charger les prestations pour le moment ». Les tests n'en ont pas besoin :
# Vitest les force à vide, Playwright utilise des valeurs factices et simule Supabase.

# Navigateurs pour les tests end-to-end (Chromium = Android et desktop, WebKit = iPhone)
npx playwright install chromium webkit

npm run dev   # http://localhost:5173
```

> ⚠️ La clé `service_role` de Supabase ne doit **jamais** apparaître dans `src/` ni dans un commit :
> elle contourne toutes les règles de sécurité.

## Scripts

| Commande                | Rôle                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `npm run dev`           | Serveur de développement sur http://localhost:5173               |
| `npm run build`         | Vérifie les types puis construit `dist/`                         |
| `npm run preview`       | Sert le build de production en local                             |
| `npm run lint`          | ESLint sur tout le projet                                        |
| `npm run typecheck`     | Vérification TypeScript seule                                    |
| `npm run test`          | Tests unitaires et composants (Vitest)                           |
| `npm run test:coverage` | Idem + couverture (seuil 80 % sur `src/features/` et `src/lib/`) |
| `npm run test:e2e`      | Tests end-to-end Playwright (Android, iPhone, desktop)           |

Base de données (CLI Supabase installée en devDependency, version figée) :

| Commande                           | Rôle                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| `npx supabase start`               | Lance Supabase en local (Docker), migrations + seed      |
| `npx supabase db start`            | Postgres seul, plus rapide : suffit pour les tests pgTAP |
| `npx supabase db reset`            | Recrée la base locale (migrations, `seed.sql`)           |
| `npm run db:reset:dev`             | Idem, puis `seed-dev.sql` (lieux actifs, dispos de test) |
| `npx supabase migration new <nom>` | Nouvelle migration SQL versionnée                        |
| `npx supabase test db`             | Tests pgTAP (dont les accès interdits)                   |
| `npx supabase stop`                | Arrête les conteneurs                                    |

## Base de données

Schéma complet et justification : [`docs/adr/0002-modele-de-donnees-et-securite.md`](docs/adr/0002-modele-de-donnees-et-securite.md).

| Table            | Contenu                                        | Accès public (anon)               |
| ---------------- | ---------------------------------------------- | --------------------------------- |
| `services`       | prestations : nom, durée, prix affiché, actif  | lecture des prestations actives   |
| `locations`      | lieux : localité seulement, **aucune adresse** | aucun                             |
| `availabilities` | plages de disponibilité, chacune dans un lieu  | aucun (via `get_available_slots`) |
| `bookings`       | réservations clients                           | aucun (via les RPC ci-dessous)    |
| `gallery_items`  | photos de la galerie (bucket Storage privé)    | photos publiées, par URL signée   |
| `admins`         | utilisateurs Supabase Auth administrateurs     | aucun                             |

Fonctions RPC publiques (`security definer`, validation complète en SQL) :

| Fonction                                | Rôle                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `get_available_days(service_id)`        | jours des 4 semaines qui ont au moins un créneau + leur nombre, en une requête (ADR 0010) |
| `get_available_slots(service_id, jour)` | créneaux libres d'un jour + libellé public du lieu, en un appel                           |
| `create_booking(..., request_id)`       | réserve et renvoie le récap (localité, `cancel_token`) ; rejeu idempotent (ADR 0009)      |
| `get_booking(cancel_token)`             | récap pour le porteur du lien d'annulation                                                |
| `cancel_booking(cancel_token)`          | annule si le délai le permet                                                              |

Erreurs renvoyées au front (message de l'exception) : `invalid_input`, `slot_unavailable`,
`too_soon`, `too_far`, `limit_reached`, `too_late`, `request_conflict`. Côté front, toute réponse
est validée par Zod (`src/lib/schemas.ts`) et aucun message brut de Supabase n'est recopié.

Règles centralisées dans `private.settings()` (une migration suffit pour les changer) : grille
de créneaux de 70 min, réservation au plus tard 2 h avant et au plus 4 semaines à l'avance,
annulation jusqu'à 24 h avant, 2 RDV futurs max par téléphone ou email, conservation des données
clients 6 mois, rejeu d'une réservation (même clé) accepté 30 min. Le front en garde une copie pour ses textes (`src/lib/bookingRules.ts`).

Durcissements : le public (anon) ne lit sur `services` que `id`, `name`, `duration_min`,
`price_label` et `sort_order`. Aucune adresse n'est stockée (ADR 0008) : le client voit la
localité et demande l'adresse à Alix sur Instagram (`src/lib/contact.ts`).

Tests : `supabase/tests/` (pgTAP), un fichier par thème — schéma, anonyme, admin,
chevauchements, `create_booking`, créneaux (dont le changement d'heure), tokens, Storage,
galerie (chemins, types, limite de 60 photos, accord avant publication).
`supabase/seed.sql` : prestations et lieux de départ, relançable sans doublon, à lancer à la main
dans le SQL Editor du projet distant. Il n'insère que ce qui manque, ne modifie et ne supprime
rien. Les lieux sont créés **inactifs**, sans adresse : leur activation est une décision de mise
en ligne.

`supabase/seed-dev.sql` : lieux actifs et disponibilités de test, pour la
base **locale uniquement** (`npm run db:reset:dev`). Il n'est pas listé dans `config.toml`,
donc `supabase db push --include-seed` ne peut pas l'embarquer, et il s'arrête de lui-même sur
une base qui n'est pas une base locale neuve (compte, RDV ou lieu inconnus).

## Routes

Squelette en place : structure et textes provisoires, sans style ni appel à la base.

| Route                        | Page                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `/`                          | Accueil, une seule longue page : `#accueil`, `#prestations`, `#galerie`, `#reserver`    |
| `/reserver`                  | Parcours de réservation (prestation, jour, créneau, coordonnées, consentement)          |
| `/annuler`                   | Annulation via le lien personnel (`#<jeton>`)                                           |
| `/admin/connexion`           | Connexion de l'espace admin (compte créé à la main : `docs/ADMIN-COMPTE.md`)            |
| `/admin/…`                   | Espace admin : redirige vers la connexion sans session admin, PWA (`admin.webmanifest`) |
| `/mentions-legales`          | Mentions légales                                                                        |
| `/politique-confidentialite` | Politique de confidentialité                                                            |
| toute autre URL              | Page 404                                                                                |

Prestations et galerie ne sont pas des routes : ce sont des sections de l'accueil, accessibles
par les ancres du menu (`/#prestations`, `/#galerie`). L'espace admin n'apparaît pas dans le menu
public.

## Architecture

```
src/
├── pages/            une page par route (Accueil, Réserver, Admin…)
├── components/       composants réutilisables
│   └── ui/           composants shadcn/ui (code copié, modifiable)
├── features/         logique métier, par fonctionnalité
│   ├── booking/      créneaux, réservation, annulation (data.ts, validation.ts)
│   ├── admin/        connexion et mot de passe (auth.ts), disponibilités, rendez-vous (data.ts),
│   │                 galerie (gallery.ts : envoi, publication, ordre, suppression)
│   └── gallery/      galerie publique (data.ts, URL signées) et préparation des photos
│                     dans le navigateur (processImage.ts : 1200 px, WebP/JPEG, sans EXIF)
├── lib/
│   ├── supabase.ts   client Supabase public (getSupabase, sans session)
│   ├── supabaseAdmin.ts  client Supabase admin (getSupabaseAdmin, session persistante)
│   ├── database.types.ts  types des tables, écrits à la main d'après les migrations
│   ├── dates.ts      dates : stockées en ISO, affichées en heure de Paris
│   └── schemas.ts    schémas Zod partagés
└── test/setup.ts     configuration des tests

e2e/                  tests Playwright
supabase/
├── migrations/       toute évolution du schéma, versionnée
├── tests/            tests pgTAP (règles SQL, RLS, accès interdits)
├── seed.sql          prestations et lieux de départ (inactifs, sans adresse)
├── seed-dev.sql      disponibilités de test, base locale uniquement
└── config.toml       configuration de la stack locale
docs/                 SPEC, PLAN, DESIGN, ADR, TESTS-APPAREILS (checklist téléphones)
.github/workflows/    CI (lint, types, tests, pgTAP, build, e2e)
```

Deux principes :

- **La logique vit dans `src/features/`**, pas dans les composants. Les pages assemblent, elles ne
  calculent pas. C'est ce qui rend la logique testable sans DOM.
- **Toute modification du schéma passe par une migration** dans `supabase/migrations/`. On ne
  modifie jamais une migration déjà appliquée : on en crée une nouvelle.

## Sécurité

- RLS activée sur toutes les tables, sans exception, et chaque GRANT écrit explicitement.
- Le public ne lit jamais les réservations ni les lieux : il passe par des fonctions RPC
  `security definer` (`get_available_days`, `get_available_slots`, `create_booking`,
  `get_booking`, `cancel_booking`) qui valident tout côté SQL.
- Aucune adresse n'est stockée : seule la localité du lieu est affichée ; l'adresse se demande
  à Alix sur Instagram (ADR 0008).
- Annulation par `cancel_token` (uuid aléatoire), jamais par l'identifiant de la réservation.
- Un créneau ne peut pas être réservé deux fois, tous lieux confondus : contrainte d'exclusion
  PostgreSQL, et non une vérification côté navigateur.
- Anti-spam : champ honeypot et 2 RDV futurs maximum par téléphone ou email.

## Tests end-to-end (Playwright)

Chaque test de `e2e/` tourne sur trois projets (`playwright.config.ts`) :

| Projet           | Moteur   | Simule                                        | Écran      |
| ---------------- | -------- | --------------------------------------------- | ---------- |
| `mobile-android` | Chromium | Chrome Android (profil Pixel 5)               | 375 × 812  |
| `mobile-iphone`  | WebKit   | Safari iOS (profil iPhone 17, user agent iOS) | 375 × 812  |
| `desktop`        | Chromium | Chrome sur ordinateur                         | 1280 × 800 |

```bash
npm run test:e2e                              # les trois projets
npx playwright test --project=mobile-iphone   # un seul projet
```

`e2e/accessibilite.spec.ts` passe chaque route à **axe** (`@axe-core/playwright`, règles WCAG
A/AA) : il détecte les erreurs mécaniques (label manquant, titres sautés, lien sans nom), pas
tout. La navigation au clavier et la lecture d'écran se vérifient encore à la main.

**Ce que WebKit couvre** : le moteur de rendu et le moteur JavaScript de Safari (CSS, `Date`,
formulaires, comportements propres à WebKit), l'écran tactile et la taille d'un iPhone.
**Ce qu'il ne couvre pas** : ce n'est pas Safari iOS mais WebKit compilé pour Windows / Linux.
Pas de vrai clavier virtuel, pas d'encoche ni de zones sûres, pas de barre d'adresse qui se
replie, pas de réseau mobile, pas d'économie d'énergie. Il **ne remplace pas un vrai iPhone** :
la checklist [`docs/TESTS-APPAREILS.md`](docs/TESTS-APPAREILS.md) se refait à la main sur un
vrai iPhone et un vrai Android avant chaque mise en ligne.

## Navigateurs supportés

Environ 90 % des visiteurs (clients et barber) seront sur téléphone.

- **Safari iOS 16.4+** et **Chrome Android récent** : c'est la limite basse imposée par
  Tailwind CSS v4 (propriétés CSS modernes comme `@property` et `color-mix()`).
- Desktop (Chrome, Firefox, Safari, Edge récents) : supporté, en adaptation secondaire.

## Captures

_À ajouter quand l'identité visuelle sera en place (phase 3)._

## Licence

Projet personnel, tous droits réservés.
