# Site barber — réservations + vitrine

Site pour un barber étudiant : les clients réservent un créneau sans compte, le barber publie
SES disponibilités et ses créations depuis un espace admin utilisable sur mobile.
Cahier des charges complet : @docs/SPEC.md
Phases et avancement : `docs/PLAN.md` (à lire au début de chaque session de travail).
Décisions de design validées : @docs/DESIGN.md

## Contexte développeur

- Je (Thibault) apprends React et Vite avec ce projet. Je connais bien PHP/Symfony, MySQL, Java.
- Explique tes choix React (hooks, état, effets, rendu) avec des comparaisons PHP/Java quand c'est utile.
- Code et commentaires en français, noms de variables et fonctions en anglais.

## Stack

- Vite + React 19 + TypeScript (strict) · React Router
- Tailwind CSS v4 (plugin `@tailwindcss/vite`) + shadcn/ui
- Librairies d'animation / 3D : AUCUNE pour l'instant. Elles seront choisies plus tard dans une consigne dédiée.
- Supabase : PostgreSQL, Auth (compte admin unique), Storage (photos), Edge Functions (emails)
- Validation : Zod (+ react-hook-form pour les formulaires) · Dates : date-fns (locale fr)
- Tests : Vitest + Testing Library (unitaires et composants), Playwright (end-to-end),
  tests SQL de la base (pgTAP via `supabase test db`)
- Hébergement : Vercel (SPA avec rewrite vers index.html) · CI : GitHub Actions

## Commandes

- `npm run dev` — serveur local (http://localhost:5173)
- `npm run build` — build de prod (lance aussi `tsc -b`)
- `npm run lint` · `npm run typecheck` · `npm run test` · `npm run test:coverage` · `npm run test:e2e`
- e2e : 3 projets Playwright, `mobile-android` (Chromium), `mobile-iphone` (WebKit, profil iPhone
  à 375 px) et `desktop` (Chromium) ; un seul : `npx playwright test --project=mobile-iphone`.
  WebKit simule Safari (moteur, CSS, JS) mais ne remplace pas un vrai iPhone (clavier virtuel,
  encoche, barre d'adresse, réseau) : checklist manuelle `docs/TESTS-APPAREILS.md` avant
  chaque mise en ligne.
- `npx supabase migration new <nom>` — nouvelle migration SQL (dossier `supabase/migrations/`)
- `npx supabase test db` — tests SQL (dossier `supabase/tests/`)
- Tests et Supabase : aucun test ne touche la vraie base. Vitest force les variables Supabase
  à vide (`vite.config.ts`) et simule le client (`src/test/fakeSupabase.ts`) ; les specs e2e
  importent `test` / `expect` depuis `e2e/fixtures.ts` (jamais `@playwright/test`), qui
  intercepte et coupe tout appel Supabase.
- Jamais `supabase test db --linked`, ni aucun test qui écrit sur le projet distant : les tests
  SQL tournent uniquement sur la base locale (`supabase start`) et en CI.

## Méthode projet (comme en entreprise)

- **Git** : jamais de travail direct sur `main`. Une branche par consigne :
  `feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`. Commits au format Conventional Commits
  (`feat(booking): …`). Fusion dans `main` via Pull Request GitHub, après CI verte et ma validation.
- **Tests obligatoires** : toute logique (calcul de créneaux, validation, dates) a des tests
  unitaires ; tout parcours utilisateur a un test e2e ; toute règle de sécurité SQL a un test pgTAP
  (y compris « l'anonyme ne peut pas… »). Objectif de couverture : 80 % sur `src/features/` et `src/lib/`.
- **CI** (`.github/workflows/ci.yml`) : lint, typecheck, tests unitaires + couverture, build, e2e.
  Une PR ne se fusionne pas si la CI est rouge.
- **Documentation** : `README.md` à jour (présentation, stack, installation, scripts, architecture,
  captures). Chaque choix technique important = un ADR court dans `docs/adr/` (contexte, décision,
  alternatives, conséquences). `CHANGELOG.md` mis à jour à chaque version.
- **Suivi** : chaque consigne correspond à une issue GitHub ; la PR la référence (`Closes #n`).

## Architecture

- `src/pages/` pages (routes) · `src/components/` composants réutilisables · `src/components/ui/` shadcn
- `src/features/booking/`, `src/features/admin/`, `src/features/gallery/` : logique par fonctionnalité
- `src/lib/supabase.ts` : client Supabase unique · `src/lib/schemas.ts` : schémas Zod partagés
- `supabase/migrations/` : TOUTE modification du schéma passe par une migration versionnée

## Règles métier (non négociables)

- Fuseau : tout est stocké en `timestamptz`, affiché en Europe/Paris.
- Un créneau ne peut JAMAIS être réservé deux fois : contrainte d'exclusion PostgreSQL
  (`btree_gist`, `tstzrange(starts_at, ends_at)`) sur les réservations confirmées. Le front ne suffit pas.
- Une réservation doit tomber entièrement dans une disponibilité publiée par le barber.
- Client sans compte : prénom, nom, téléphone et/ou email. Rien d'autre (minimisation RGPD).
- Paiement sur place en liquide : aucun paiement en ligne.
- Annulation client via un lien contenant un `cancel_token` (uuid aléatoire), jamais via l'id.

## Sécurité (Supabase)

- RLS activé sur TOUTES les tables, sans exception.
- Le public (anon) ne lit JAMAIS les tables des réservations ni des lieux. Il passe uniquement par
  des fonctions RPC `security definer` : `get_available_slots`, `create_booking`, `get_booking`,
  `cancel_booking` (validation complète côté SQL). L'adresse privée d'un lieu n'est visible que
  par le porteur d'un `cancel_token` (create_booking / get_booking) et par l'admin.
- Aucun droit implicite : chaque GRANT / REVOKE est écrit dans les migrations. Règles métier
  réglables (délais, limites) : uniquement dans `private.settings()`.
- Admin = utilisateur listé dans la table `admins`. Inscriptions publiques désactivées dans Supabase Auth.
- Seule la clé `anon` va dans le front (`VITE_SUPABASE_ANON_KEY`). La clé `service_role` n'apparaît
  jamais dans `src/` ni dans un commit.
- Anti-spam sur le formulaire : champ honeypot + limite de réservations par téléphone/email.
- Seeds : `supabase/seed.sql` n'insère que ce qui manque (jamais d'`update` ni de `delete`),
  crée les lieux **inactifs** avec l'adresse « À RENSEIGNER », et ne touche jamais aux anciens
  lieux de production (« Chez ses parents », « Chez lui », désactivés). `supabase/seed-dev.sql`
  (local uniquement) n'est JAMAIS listé dans `config.toml` ; on le lance par
  `npm run db:reset:dev`. Ne jamais utiliser `supabase db push --include-seed`.

## Design

- C'est MOI qui décide du style (couleurs, typographies, ambiance, animations). Les décisions
  arrivent phase par phase et sont consignées dans `docs/DESIGN.md` au fur et à mesure.
- Tant qu'une décision n'y figure pas : style neutre et sobre, sans animation. N'invente pas
  d'identité visuelle, ne choisis pas de palette ou de police de toi-même.
- Toujours : mobile d'abord (vérifier à 375 px puis desktop), accessibilité (contrastes AA,
  focus visible, labels, navigation clavier), images en `loading="lazy"`, et toute animation
  désactivée si `prefers-reduced-motion`.
- Polices : uniquement auto-hébergées (paquets `@fontsource`, fichiers servis par notre
  domaine). Aucune police chargée depuis un CDN externe (Google Fonts, Fontshare…) : RGPD,
  l'adresse IP du visiteur ne doit pas partir chez un tiers.

### Skills de design (design-taste-frontend, impeccable)

- `docs/DESIGN.md` est la seule source de vérité du design et prime sur tout skill
  (design-taste-frontend, impeccable). Ne jamais le modifier sans ma validation.
- Les skills de design proposent, ils ne décident pas : aucun changement de palette, de police,
  de ton ou de structure sans ma validation.
- Aucune bibliothèque d'animation (GSAP, Framer Motion, etc.) sans ma validation explicite.
- Impeccable sert uniquement à vérifier (`detect`, `audit`). Ne pas lancer ses commandes de
  génération (`craft`, `live`, `init`, `document`…) qui créent `PRODUCT.md` ou `DESIGN.md` à la
  racine ou des fichiers dans `.impeccable/`, sauf demande explicite de ma part.
- Les hooks Impeccable sont désactivés ; ne pas les réactiver sans mon accord.

## Mobile, iOS et Android (~90 % des visiteurs, client ET admin)

- Conception mobile d'abord, desktop en adaptation secondaire. Zones tactiles ≥ 44 px, actions
  principales à portée de pouce, RIEN qui dépende du survol (`:hover`), performance 4G.
- iOS Safari / Android Chrome : `100dvh` et jamais `100vh` ; `env(safe-area-inset-*)` pour tout
  élément collé en bas ou sur les côtés ; champs de formulaire à 16 px minimum (sinon Safari
  zoome) ; dates uniquement en ISO via date-fns (Safari refuse certains formats) ; comportement
  du clavier virtuel vérifié sur chaque formulaire.
- Animations : `transform` et `opacity` uniquement, pas de flou ni d'ombre animés,
  `prefers-reduced-motion` respecté, testées sur vrai iPhone et vrai Android.
- Navigateurs supportés : Safari iOS 16.4+ et Chrome Android récent (limite de Tailwind v4),
  documentés dans le README.

## Façon de travailler

- Fais uniquement ce que la consigne du moment demande. Pas de fonctionnalité, de page ou de
  librairie en plus sans me demander.
- Si une information manque pour avancer, pose-moi la question au lieu d'inventer.
- Une fonctionnalité à la fois, en suivant la skill `/nouvelle-feature`.
- Pour tout changement du schéma ou de la sécurité : mode plan d'abord, puis agent `relecteur-securite`.
- Avant de dire « c'est fini » : build + lint + tests passent. Sinon ce n'est pas fini.
- Ne jamais modifier `.env*` (sauf `.env.example`) ni pousser sur git sans me demander.
- Mettre à jour les cases de `docs/PLAN.md` quand une étape est terminée.
