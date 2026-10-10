# Plan de réalisation

Les consignes de chaque étape sont données au fur et à mesure (préparées à part, puis collées ici
dans Claude Code). Claude coche les cases quand une étape est terminée et validée.

## Phase 1 — Socle technique

- [ ] Projet Vite + React + TS, Tailwind v4, shadcn/ui, React Router, ESLint + Prettier
      _(fait, sauf shadcn/ui : volontairement reporté à la phase 3, son CLI imposant de choisir
      un preset qui embarque police, icônes et thème)_
- [x] Tests : Vitest + couverture, Playwright (e2e), scripts npm
- [ ] Dépôt GitHub, protection de `main`, issues pour chaque phase, modèle de PR
      _(modèle de PR fait ; le reste est à faire à la main sur GitHub)_
- [x] CI GitHub Actions (lint, typecheck, tests, build, e2e) · README · ADR 0001 (choix de stack)
- [x] Pages vides et navigation (accueil, prestations, galerie, réserver, admin)
- [ ] Déployé (Cloudflare Pages, plus tard : rien n'est en ligne pour l'instant)

## Phase 2 — Base de données et sécurité

- [ ] Projet Supabase (dev) relié
      _(CLI installée, `supabase init` fait, MCP en lecture seule ; `supabase login` / `link`
      et `db push` à faire à la main)_
- [x] Tables, contrainte anti-double-réservation (tous lieux), RLS, lieux à adresse privée
- [x] Fonctions RPC : créneaux libres, réserver, consulter, annuler · bucket Storage galerie
- [x] Tests pgTAP (dont accès interdits et changement d'heure) + job CI + revue `relecteur-securite`
- [x] Règles confirmées avec le barber (consigne 14) : créneaux de 70 min, réservation au plus
      tard 48 h avant, 4 semaines, annulation jusqu'à 24 h avant, 2 RDV futurs ; contrainte
      « pas d'adresse provisoire sur un lieu actif » ; anon limité aux colonnes d'affichage de
      `services`. Appliqué en local. Ordre pour la base de production : fusionner la PR (le
      front n'utilise plus `.eq("active", true)`), PUIS appliquer la migration (`db push`).
- [ ] Conservation des données clients (6 mois) à confirmer avec le barber

## Phase 3 — Identité visuelle

- [x] `/direction-artistique` : 3 propositions, choix B + C, docs/DESIGN.md + ADR 0003
- [x] Couleurs, typographies, composants de base
      _(tokens, Archivo, Button, Field, Section, Card, hero ; restent : style des champs à
      valider, vidéo et poster du hero, logo HD)_

## Phase 4 — Vitrine

- [x] Squelette des pages : structure HTML, textes provisoires, sans style ni base
      (accueil à sections, /reserver, /annuler, /admin, pages légales, 404), tests e2e et axe
- [ ] Accueil · Prestations · Galerie · Contact · Pages légales
      _(structure en place ; restent le style, les vraies données, les photos, la section
      contact et la rédaction des pages légales)_

## Phase 5 — Réservation client

- [x] **Client Supabase et prestations réelles** (consigne 13) : `src/lib/supabase.ts` (sans
      session, sans plantage si une variable manque), types écrits à la main
      (`src/lib/database.types.ts`), `getServices` lit la table `services` (accueil et étape 1
      de /reserver), états chargement / erreur / vide, `supabase/seed.sql` idempotent,
      tests Vitest (client simulé) et Playwright (Supabase intercepté par `e2e/fixtures.ts`).
- [ ] **À faire à la main** : lancer `supabase/seed.sql` dans le SQL Editor du projet distant,
      puis vérifier /reserver avec `.env.local` renseigné. Noms et prix à confirmer avec Alix.
      Avant la première dispo : saisir l'adresse de chaque lieu ET l'activer dans la même requête
      (les lieux du seed sont créés inactifs).
- [x] Revue sécurité : lieux du seed inactifs, `seed-dev.sql` retiré de `config.toml`
      (`npm run db:reset:dev` en local) avec une garde renforcée.
- [x] **Créneaux et réservation réels** (consigne 15, issue #18) : migration
      `…_reservation_reelle.sql` (`get_available_slots` avec `location_id` ; `create_booking`
      avec `p_location_id`, sans adresse privée, logique dans `private.create_booking_at(p_now…)`,
      verrou consultatif global + exclusion, bornes des entrées ; `get_booking` sans adresse ;
      les 4 RPC exécutables par `anon` seulement). Front : `getAvailableSlots` et
      `createBooking` appellent les RPC, délai de 48 h expliqué, créneau perdu → liste relue,
      message de limite neutre, confirmation sans adresse. pgTAP (09 règles aux limites à date
      fixe, 10 concurrence réelle via dblink), Vitest, Playwright (3 projets). Appliqué en
      local seulement. Ordre pour la production : migration (`db push`) PUIS front (le front
      de `main` n'appelle pas ces RPC ; le nouveau exige les nouvelles signatures).
- [x] **Annulation par lien réelle** (consigne 16, issue #20) : migration
      `…_annulation_testable.sql` (`private.get_booking_at` / `cancel_booking_at` avec `p_now`,
      sans droit ; RPC publiques `anon` seulement ; un RDV terminé se comporte comme un lien
      inconnu : 0 ligne / `false`, plus de `too_late`). `/annuler` lit les vraies RPC ; 4 états ;
      « Lien invalide » identique pour absent, mal formé, inconnu et expiré ; double clic sans
      double annulation ; aucune adresse. pgTAP 11 (24 h pile / 23 h 59, 24 h absolues au
      changement d'heure, décompte des 2 RDV, fuites, droits), Vitest, Playwright (3 projets).
      Pont `syncFakeServices` supprimé. Appliqué en local seulement. Ordre pour la production :
      migration (`db push`) PUIS front.
- [ ] `src/lib/fakeDb.ts` reste utilisé par l'admin et la galerie (fictifs) : à supprimer avec
      eux, phase 6.
- [ ] Poids du bundle : supabase-js ajoute ~56 kB gzip (107 → 163 kB, avertissement Vite
      « chunk > 500 kB »). Piste à valider : charger le client par import dynamique.

- [ ] Parcours complet · Confirmation + .ics + lien d'annulation · Page d'annulation
      _(maquette fonctionnelle faite sur fausse base (src/lib/fakeDb.ts) : parcours en 4 étapes
      (prestation, jour et créneau avec le lieu affiché, coordonnées, récap),
      confirmation avec lien d'annulation et bouton « Copier le lien » (aucun e-mail de
      confirmation : la page invite à copier le lien ou à faire une capture d'écran), 4 états de
      /annuler. Reste : branchement Supabase)_
- [x] **Branchement SQL des créneaux (règle : le client choisit un créneau, jamais un lieu)** :
      fait par la consigne 15 (`location_id` dans les créneaux, `p_location_id` vérifié par
      `create_booking`, tests pgTAP 09).
- [x] ~~Fonction des lieux publics (`id` + `public_label`)~~ : **plus nécessaire**, le lieu (id
      et libellé public) arrive avec chaque créneau via `get_available_slots`. Seul cas qui la
      justifierait encore : afficher les lieux hors du parcours (ex. section « Où me trouver »
      de l'accueil), à décider le moment venu.
- [ ] **Règle de révélation de l'adresse privée à décider** (à quel moment, et à qui, le
      client l'apprend). Depuis la consigne 15, AUCUNE RPC ne la renvoie (`create_booking`,
      `get_booking`) et l'écran de confirmation ne l'affiche pas (TODO dans
      `ConfirmationStep.tsx` et `CancelPage.tsx`) : un client qui réserve ne sait donc pas où
      aller. **À trancher avant d'activer un lieu en production** (voir la phase 8 et le
      risque n° 1 de l'ADR 0002).
- [ ] **Contact Instagram sur l'écran « Trop tard pour annuler en ligne »** de `/annuler`
      (lien vers le compte du barber, zone tactile 44 px) dès que le compte est fourni.
- [x] Tests Playwright (3 projets) _(parcours /reserver et 4 états de /annuler, RPC interceptées)_
- [x] `noindex` sur `/annuler` (prop `noindex` de `PageMeta` + `X-Robots-Tag` dans
      `public/_headers`).
- [ ] **`<meta name="robots" content="noindex">` sur `/admin` et la 404** (la prop `noindex` de
      `PageMeta` existe : il reste à l'utiliser). **À faire avant la mise en ligne.**
- [x] `referrer: no-referrer` sur `/annuler` : balise `<meta name="referrer">` (prop `noReferrer`
      de `PageMeta`) + `Referrer-Policy` dans `public/_headers` (Cloudflare Pages), **fichier
      prêt, rien de déployé**.
- [ ] **Hébergeur à trancher, puis déployer les en-têtes** : CLAUDE.md et l'ADR 0001 disent
      Vercel (`vercel.json` existe), README et ce plan disent Cloudflare Pages. `_headers` est
      ignoré par Vercel : si c'est Vercel, mettre l'équivalent dans `vercel.json` (`headers`).
      **À vérifier après le déploiement** : `curl -sI <site>/annuler` doit montrer
      `referrer-policy: no-referrer` et `x-robots-tag: noindex`.
- [ ] **Jeton dans le fragment `#` plutôt que `?token=`** (proposition de la consigne 16, non
      appliquée faute de décision) : le fragment n'est jamais envoyé au serveur (ni journaux
      d'hébergeur, ni Referer). Aucun lien réel n'existe encore : à décider AVANT la mise en
      ligne, après il casserait les liens déjà envoyés. Touche `CancelPage`, `ConfirmationStep`,
      SPEC, README. Mesuré en e2e : avec `?token=`, les requêtes
      vers NOTRE site (modules, assets) portent l'adresse complète dans le Referer, donc dans
      les journaux de l'hébergeur ; `no-referrer` ne couvre que les requêtes vers un autre hôte.
- [ ] Formulaire : `required` (ou équivalent via Zod / react-hook-form) et zones `aria-live`
      pour les créneaux, les erreurs et la confirmation _(reporté depuis le squelette des pages)_
- [ ] Accessibilité : déplacer le focus (h1 ou `main`) après un changement de page, pour que
      les lecteurs d'écran l'annoncent _(reporté depuis le squelette des pages)_

## Phase 6 — Espace admin

- [ ] Connexion · Disponibilités · Liste des RDV · Galerie · Prestations
      _(maquettes faites sur fausse base : connexion, tableau de bord, RDV, dispos (ajout,
      suppression), galerie (sans envoi), mot de passe, déconnexion ; faux état connecté réservé
      au dev, absent du build de prod (test). Restent : branchement Supabase Auth / tables /
      Storage, prestations, duplication d'une semaine, annulation d'un RDV par le barber)_
- [ ] Disponibilités : afficher au barber qu'un créneau ne devient visible des clients que
      48 h avant (« visible à partir de J+2 »), pour qu'il publie ses dispos assez tôt.

## Phase 7 — Animations et effets

- [ ] Choix des librairies et des effets (docs/DESIGN.md) · Mise en place

## Phase 8 — Mise en ligne

- [ ] Version 1.0.0 : tag Git, CHANGELOG, README avec captures
- [ ] `/check-deploiement` · Données de test supprimées · Compte admin du barber · Domaine
- [ ] **Purge RGPD codée et planifiée** : suppression des données clients 6 mois après le RDV
      (`private.settings().data_retention`). **Bloquant pour la mise en ligne** (ADR 0002).
- [ ] **Protéger l'adresse privée** : la révéler tard (ex. quelques heures avant le RDV) ou après
      validation de la réservation par le barber. Depuis la consigne 15, plus aucune RPC ne la
      renvoie : il reste à DÉCIDER et coder la règle de révélation (risque n° 1 de l'ADR 0002).
      **Bloquant pour la mise en ligne.**
- [ ] **Anti-abus des réservations** (revue sécurité de la consigne 15, décision 2026-10-10 :
      pas maintenant, mais **bloquant pour la mise en ligne**). Deux risques :
  - **Créneaux saturés** : un script qui appelle `create_booking` directement (le honeypot ne
    le gêne pas) avec des numéros inventés peut réserver tous les créneaux des 4 semaines.
  - **Blocage du numéro d'un tiers** : en réservant 2 RDV avec le téléphone ou l'email de
    quelqu'un d'autre, on l'empêche de réserver ; la réponse `limit_reached` permet aussi de
    compter ses RDV futurs (risque n° 4 de l'ADR 0002).
  - Options à choisir : plafond global (`max_bookings_per_hour` dans `private.settings()`,
    vérifié sous le verrou global de `create_booking_at`) ; annulation d'un RDV côté admin
    (phase 6, pour nettoyer les fausses réservations) ; Cloudflare Turnstile avancé en V1.

## Backlog (non planifié)

- [ ] Bouton « Ajouter à mon calendrier » (.ics) sur la confirmation de réservation (SPEC V1).
- [ ] Calendrier de /reserver : griser les jours sans créneau (une requête pour les 4 semaines,
      jours sans dispo en `aria-disabled`).
- [ ] Annulation d'un RDV par le barber, en phase admin : nouvelle RPC (motif, statut
      `cancelled`), tests pgTAP (seul l'admin peut l'appeler).

## V2

- [ ] Emails (Resend, nécessite un domaine) · Admin installable (PWA) · Captcha si spam
