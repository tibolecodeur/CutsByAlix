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
- [ ] Déployé (Cloudflare Pages) : dépôt prêt (consigne 22, issue #32 : `_headers`, repli SPA,
      `robots.txt`, anti-pause, `docs/DEPLOIEMENT.md`, ADR 0007) ; création du projet
      Cloudflare, variables et réglages Supabase Auth faits à la main par Thibault

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
      valider, logo HD ; vidéo et poster du hero faits, 360×640 en attendant une source HD)_

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
- [x] ~~`src/lib/fakeDb.ts`~~ : supprimé avec la galerie fictive (consigne 20).
- [x] **Délai minimum de réservation à 5 h** (consigne 21, issue #30) : migration
      `…_delai_reservation_5h.sql` (seule `min_notice` de `private.settings()` passe de 48 h à
      5 h ; annulation à 24 h inchangée ; aucune donnée touchée ; corps de la fonction comparé
      avant/après par `pg_get_functiondef`). Le front suit via `src/lib/bookingRules.ts` (la règle
      « visible à J+2 » découlait des 48 h : aucune règle séparée). Un RDV réservé à moins de
      24 h n'est pas annulable en ligne : avertissement au récapitulatif et à la confirmation,
      message « contacte Alix directement » sur `/annuler` (TODO contact : coordonnées d'Alix à
      fournir). pgTAP 16 + 05, 08, 09, 13 adaptés (4 h 59 refusé / 5 h 01 accepté, 23 h 59 /
      24 h 01), Vitest et Playwright (horloge figée). Appliqué en local seulement. Ordre pour la
      production : fusionner la PR PUIS `db push`.
- [x] **Tarifs, durées et paiement** (consigne 26, branche `feat/tarifs-paiement`) : Coupe 60 min /
      10 €, Coupe + barbe 70 min / 12 €, paiement « en liquide ou par virement » (récapitulatif,
      confirmation, page de réservation, accueil). Migration `…_tarifs_durees_paiement.sql`
      (ADR 0011) : la fin d'un RDV et d'un créneau proposé = durée du créneau (`slot_step`,
      70 min) et non `services.duration_min` ; mise à jour des deux prestations par nom, rien si
      la table est vide, échec si l'une manque ; RDV existants inchangés. pgTAP 27 ajouté,
      03, 04, 05, 09, 10, 11, 14, 16, 19, 25, 26 adaptés (plages de 70 min). Ordre pour la
      production : une seule migration, `db push` puis requête de contrôle en lecture seule.
- [ ] **Créneaux de durée variable selon la prestation** : non fait, à reconsidérer si Alix le
      demande (aujourd'hui tous les créneaux font 70 min).
- [x] **Délai minimum de réservation à 2 h** (consigne 28) : migration
      `…_delai_reservation_2h.sql` (seule `min_notice` de `private.settings()` passe de 5 h à
      2 h ; les 8 colonnes reprises de `…_reservation_idempotente.sql`, la définition en vigueur ;
      annulation à 24 h inchangée ; aucune donnée touchée). Front via `src/lib/bookingRules.ts`.
      pgTAP 05, 08, 09, 13, 16 (renommé `16_delai_reservation_test.sql`), 24, 26 ; Vitest et
      Playwright adaptés (bornes 1 h 59 / 2 h 01, 21 h 59 / 22 h 01). Ordre pour la production :
      `db push` AVANT de fusionner / déployer le front (un front à 2 h devant une base à 5 h
      afficherait des créneaux que la base refuse ; l'inverse est sans danger).
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
- [x] ~~**Règle de révélation de l'adresse privée à décider**~~ : **résolu par décision le
      2026-10-12 (source : Alix, consigne 24, ADR 0008)** : aucune adresse stockée, le client
      la demande sur Instagram. Historique : (à quel moment, et à qui, le
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
- [x] `noindex` sur `/admin` (consigne 17 : `AdminHead` + `X-Robots-Tag` dans `_headers`).
- [x] **`<meta name="robots" content="noindex">` sur la 404** (prop `noindex` de `PageMeta`) :
      fait par la consigne 25 (K-05), vérifié avec wrangler en local (statut 200 du repli SPA,
      balise présente une fois la page rendue).
- [x] `referrer: no-referrer` sur `/annuler` : balise `<meta name="referrer">` (prop `noReferrer`
      de `PageMeta`) + `Referrer-Policy` dans `public/_headers` (Cloudflare Pages), **fichier
      prêt, rien de déployé**.
- [x] **Hébergeur : Cloudflare Pages** (décision du 2026-10-10), `public/_headers` conservé, pas
      de `vercel.json` à compléter. ~~CLAUDE.md et l'ADR 0001 disent encore Vercel~~ : alignés
      (consigne 22, ADR 0007, notes de correction datées dans les ADR 0001 et 0002).
- [ ] **Déployer le site sur Cloudflare Pages, puis vérifier les en-têtes** :
      `curl -sI <site>/annuler` doit montrer `referrer-policy: no-referrer` et
      `x-robots-tag: noindex, nofollow`, chaque en-tête une seule fois (vérifié en local avec
      wrangler, consigne 22 ; à refaire sur l'aperçu : `docs/TESTS-APPAREILS.md` §2.12).
- [x] **Jeton dans le fragment de l'URL** (décision du 2026-10-10) : le lien est
      `/annuler#<jeton>`. Le fragment n'est jamais envoyé au serveur : ni requête, ni Referer, ni
      journal d'hébergeur. `CancelPage` le lit dans `location.hash` (en mémoire) ; l'ancien format
      `?token=` est supprimé (rien n'est en ligne) et donne « Lien invalide » sans requête.
      L'e2e vérifie qu'aucune requête (notre site ou un tiers) ne contient le jeton, ni dans
      l'URL ni dans le Referer. Raison mesurée : avec `?token=`, même les requêtes vers notre
      propre site portaient l'adresse complète dans le Referer.
- [ ] Formulaire : `required` (ou équivalent via Zod / react-hook-form) et zones `aria-live`
      pour les créneaux, les erreurs et la confirmation _(reporté depuis le squelette des pages)_
- [ ] Accessibilité : déplacer le focus (h1 ou `main`) après un changement de page, pour que
      les lecteurs d'écran l'annoncent _(reporté depuis le squelette des pages)_

## Phase 6 — Espace admin

- [x] **Connexion, session et mot de passe** (consigne 17, issue #22) : Supabase Auth réel,
      client admin distinct (`src/lib/supabaseAdmin.ts`, session persistante, clé de stockage
      `cutsbyalix-admin-auth`), contrôle de la ligne `admins` sous RLS, route
      `/admin/connexion` (message d'erreur unique et neutre), aucune page admin montée sans
      session vérifiée, déconnexion locale, changement de mot de passe avec l'ancien (12
      caractères, aucune autre règle) qui déconnecte les autres appareils. Migration
      `…_restreindre_lecture_publique_a_anon` : un connecté non admin ne lit plus rien. Faux
      login DEV supprimé (le test de build vérifie toujours son absence). PWA admin
      (`public/admin.webmanifest`, icônes provisoires « CBA », liés depuis /admin seulement) ;
      `noindex` sur /admin (meta + `_headers`). Procédure : `docs/ADMIN-COMPTE.md`.
- [ ] **Avant de donner l'accès à Alix** : faire les réglages Supabase de
      `docs/ADMIN-COMPTE.md` (§1), créer son compte (§2) et l'ajouter à `admins`. Et surtout
      brancher les DONNÉES admin restantes (prestations ; dispos, RDV et galerie sont faits).
- [ ] **Mot de passe oublié** : pas de réinitialisation par e-mail (SMTP gratuit limité) ;
      Thibault fixe un mot de passe temporaire dans le SQL Editor (`docs/ADMIN-COMPTE.md`, §5),
      Alix le change ensuite dans « Mon compte ».
- [ ] **iPhone** : l'application ajoutée à l'écran d'accueil a un stockage séparé de Safari, il
      faut s'y connecter une fois (noté dans `docs/ADMIN-COMPTE.md`, §4).
- [ ] **Session dans le localStorage** (lisible par un script injecté) : ajouter une
      Content-Security-Policy stricte à TOUT le site dans `public/_headers`, **bloquant avant la
      mise en ligne de l'admin**. Proposition de la revue (consigne 17), à tester sur le site
      déployé : `default-src 'self'; connect-src 'self' https://<ref>.supabase.co
wss://<ref>.supabase.co; img-src 'self' https://<ref>.supabase.co data: blob:;
frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. Déjà fait : anti-iframe
      (`X-Frame-Options` + `frame-ancestors`) sur `/admin*`. **Consigne 22** : CSP posée sur
      tout le site en `Report-Only` (sans `wss:`, aucun temps réel utilisé) ; mesure locale :
      seule l'`eval` de Zod était signalée, supprimée par `z.config({ jitless: true })`
      (`docs/DEPLOIEMENT.md` §5). Passage en blocage après
      les tests sur l'aperçu, avec ta validation.
- [ ] **Changement de mot de passe vérifié côté serveur** : l'ancien mot de passe n'est
      redemandé que par le site ; un jeton volé de moins de 24 h permettrait de le changer via
      l'API. Fermé par le MFA (prévu).
- [ ] **Accueil : ancre `/#galerie` depuis une autre page** : sous forte charge (e2e en local,
      6 navigateurs en parallèle), la page défile vers la galerie avant que les prestations
      au-dessus soient chargées, puis la galerie est repoussée hors de l'écran. Test e2e
      « les ancres du menu fonctionnent depuis une autre page » parfois rouge en local (vert
      seul et en CI). Piste : refaire le défilement une fois le contenu chargé.
- [ ] Icônes PWA définitives (logo HD) à la place des icônes provisoires « CBA ».
- [ ] MFA (plus tard) ; CAPTCHA Turnstile sur la connexion (V2).
- [x] **Disponibilités réelles** (consigne 18, issue #24) : migration
      `…_admin_disponibilites.sql` (ADR 0004). Écritures par RPC `security definer` réservées
      aux admins (`admin_create_availability` via `private.admin_create_availability_at(p_now…)`,
      `admin_delete_availability`), lectures `admin_list_availabilities` (créneaux de 70 min et
      RDV par plage) et `admin_booking_rules` (valeurs de `private.settings()`, rien en dur au
      front). Base : plage future, fin > début, ≤ 24 h, ≥ 1 créneau, lieu actif, chevauchement
      traduit, verrou partagé avec `create_booking`. Suppression refusée dès qu'une réservation
      confirmée touche la plage (passée ou future). L'admin ne lit plus que `id, public_label,
    active` sur `locations` et n'écrit plus ni lieux ni plages en direct. Écran : liste par
      semaine, aperçu en direct, « Réservable par les clients du … au … », message « aucun lieu
      actif ». pgTAP 13 (date fixe), Vitest, Playwright (3 projets). Appliqué en local
      seulement. Ordre pour la production : migration (`db push`) PUIS front.
- [x] **Rendez-vous réels et annulation par le barber** (consigne 19, issue #26) : migration
      `…_admin_reservations.sql` (ADR 0005). `authenticated` n'a plus aucun droit sur
      `bookings` ; RPC admin `admin_list_bookings('upcoming' | 'past')` (sans téléphone ni
      e-mail ; passées = 30 derniers jours), `admin_get_booking` (seul endroit avec le contact),
      `admin_cancel_booking` (via `private.admin_cancel_booking_at(p_now…)` : pas de délai de
      24 h, `false` si déjà annulé, `already_started` si commencé). Colonne
      `bookings.cancelled_by` (`client` | `barber`) ; `get_booking` la renvoie et /annuler
      affiche « Rendez-vous annulé par Alix ». **Le créneau annulé par Alix redevient
      réservable** (décision du 2026-10-11). Écrans : « À venir » par jour (aujourd'hui mis en
      avant) / « Passées », compteur, détail avec « Appeler » / « SMS » / « E-mail »,
      confirmation explicite, double appui sans double annulation ; seul l'uuid dans l'URL,
      titres fixes, aucune exportation ni recherche. Tableau de bord branché aussi. pgTAP 14
      (date fixe), Vitest, Playwright (3 projets). Appliqué en local seulement. Ordre pour la
      production : migration (`db push`) PUIS front. **Rappel : la purge RGPD à 6 mois reste
      bloquante avant la mise en ligne** (phase 8) : ces écrans montrent des données clients.
- [x] **Galerie et envoi de photos** (consigne 20, issue #28) : migration `…_admin_galerie.sql`
      (ADR 0006). Bucket « gallery » **privé** (webp/jpeg, 2 Mo, nom `<uuid v4>.webp|jpg`
      imposé par la policy, aucun remplacement, plafond de 65 fichiers) ; le public n'obtient
      une URL signée (1 h) que pour une photo publiée. `gallery_items` : `alt_text`
      obligatoire (remplace `caption`), `width`/`height`, `consent_at` (publiée ⇒ accord
      daté) ; anon ne lit que les colonnes d'affichage, `authenticated` plus rien. RPC admin :
      liste, ajout (fichier vérifié, limite `private.settings().gallery_max_items` = 60),
      publication (accord redemandé à chaque fois), **masquage avec nouveau nom de fichier**
      (une URL signée peut être demandée pour des années par n'importe qui : changer le nom
      coupe tous les liens émis), texte alternatif, ordre, suppression, orphelins. Traitement
      dans le navigateur (`processImage.ts`) : type + octets d'en-tête (SVG refusé),
      orientation, 1200 px, ré-encodage canvas WebP (repli JPEG Safari) sans EXIF ni GPS.
      Écran mobile (appareil photo / galerie, aperçu, accord obligatoire, monter / descendre,
      focus géré) ; accueil branché (N&B, lazy, dimensions). pgTAP 15 (date fixe), Vitest,
      Playwright 3 projets (photo dessinée par canvas + EXIF fabriqué : part redressée, sans
      EXIF, nom uuid). Appliqué en local seulement. Ordre pour la production : migration
      (`db push`) PUIS front.
- [ ] Données admin : Prestations sur Supabase · duplication d'une semaine · modification
      d'une plage.
- [ ] Galerie, suites mineures (revue de la consigne 20) : refuser avant décodage une image
      aux dimensions démesurées (PNG de 30 000 px qui ferait planter le navigateur d'Alix) ;
      contrôle serveur du contenu des fichiers (Edge Function, V2) ; vue détail en couleur
      prévue par DESIGN.md (non faite).
- [x] Disponibilités : afficher au barber quand les clients pourront réserver (consigne 18 :
      période réservable calculée depuis les règles lues en base : 48 h / 4 semaines à l'époque, 5 h depuis la consigne 21).

## Phase 7 — Animations et effets

- [ ] Choix des librairies et des effets (docs/DESIGN.md) · Mise en place
- [ ] **Carrousel WebGL de la galerie (si retenu)** : les photos chargées comme **textures**
      exigent l'en-tête CORS côté Storage (`Access-Control-Allow-Origin` pour notre domaine)
      et `crossOrigin="anonymous"` sur l'image, sinon le canvas WebGL est « contaminé » et
      refuse de les lire. URL signées d'1 h : prévoir de les renouveler pour une page restée
      ouverte.
- [ ] **Renouveler les URL signées de la galerie (1 h)** : le futur carrousel WebGL et toute
      page galerie restée ouverte longtemps doivent redemander les URL avant leur expiration
      (`getPublishedGallery` rappelée, par exemple à 50 min ou au retour de l'onglet au
      premier plan), sinon les photos pas encore chargées s'affichent cassées.

## Phase 8 — Mise en ligne

- [x] **Audit complet avant le design** (consigne 23) : rapport `docs/AUDIT-2026-10.md` (constats
      par gravité, ordre de correction proposé), 84 tests pgTAP et des tests e2e (robustesse, connexion admin, axe) ajoutés, schéma de
      production comparé au local (identique). Aucune correction faite : elles viendront en
      consignes séparées, triées avec Thibault. Décision prise : la recopie de `error.message`
      (C-01) est déclassée en 🟡 (plus bloquante), corrigée dans la première consigne de correction.
- [x] **Robustesse du parcours client** (consigne 25, issue #37) : C-01 à C-05 et K-05 de l'audit.
      Erreurs sans message brut et réponses validées (Zod) ; `false` à l'annulation → « déjà
      annulé » ; réservation idempotente (clé `p_request_id`, rejeu accepté 30 min, ADR 0009,
      migration `…_reservation_idempotente.sql`) ; confirmation gardée le temps de l'onglet
      (`sessionStorage`, sans donnée personnelle) ; une entrée d'historique par étape (geste
      Retour) ; 404 en `noindex`. Les 18 tests sautés correspondants sont réactivés ; restent
      sautés : B-02 (3) et les 3 anciens sans défaut.
      **Ordre de mise en production : `db push` AVANT la fusion** (le nouveau front envoie
      `p_request_id` : sans la migration, toute réservation échoue en `PGRST202`). Voir
      l'ADR 0009 et `docs/audit/controle-reservation-idempotente.sql`.
- [ ] 🟡 **Hacher le jeton d'annulation** : `cancel_token` est stocké en clair dans `bookings`
      (constaté à la consigne 25). Le stocker haché (sha256) limiterait les dégâts d'une fuite de
      la base ; il faudrait alors régénérer le jeton lors d'un rejeu (ADR 0009). À planifier.
- [ ] **Lien d'annulation : un seul endroit** : pas d'e-mail en V1, le lien n'existe que sur
      l'écran de confirmation (bouton « Copier le lien » déjà présent, et la confirmation survit
      au rechargement de l'onglet depuis la consigne 25). Un client qui ferme l'onglet sans le
      garder ne peut plus annuler en ligne. **À réévaluer avant la mise en ligne** : e-mail de
      confirmation (nom de domaine vérifié, V2) ou autre moyen de le retrouver.

- [ ] Version 1.0.0 : tag Git, CHANGELOG, README avec captures
- [ ] `/check-deploiement` · Données de test supprimées · Compte admin du barber · Domaine
- [ ] **Purge RGPD codée et planifiée** : suppression des données clients 6 mois après le RDV
      (`private.settings().data_retention`). **Bloquant pour la mise en ligne** (ADR 0002).
- [x] ~~**Protéger l'adresse privée**~~ (K-04 de l'audit) : **résolu par décision le 2026-10-12
      (source : Alix)**. Le site ne stocke et n'affiche aucune adresse : la colonne
      `private_address` est supprimée (migration `…_lieux_sans_adresse.sql`, consigne 24,
      ADR 0008), le client voit la localité (« Les Ponts-de-Cé », « Saint-Christophe-du-Bois »)
      et demande l'adresse à Alix sur Instagram. Plus de règle de révélation à coder. Bloquants
      restants avant la mise en ligne : CSP en blocage (K-01), anti-abus (K-02), purge RGPD (K-03).
      Les lieux restent inactifs : leur activation est une décision de mise en ligne.
- [x] **Messages d'erreur du parcours client** : fait par la consigne 25 (C-01, C-02 ; plus aucun
      `error.message` recopié, réponses validées par Zod). Historique : (🟡 depuis l'audit :
      jamais affiché) (point 8 de la revue de la consigne 18) :
      `src/features/booking/data.ts:139` (`getServices`) et `:159` (`getAvailableSlots`)
      recopient `error.message` de Supabase dans l'`Error` levée. Ce texte brut (détails SQL,
      noms de colonnes ou de fonctions) ne doit plus en sortir : message fixe en français, comme
      les codes stables des autres fonctions. _Plus bloquant_ (décision de Thibault).
- [ ] **Anti-abus des réservations** (revue sécurité de la consigne 15, décision 2026-10-10 :
      pas maintenant, mais **bloquant pour la mise en ligne**). Deux risques :
  - **Créneaux saturés** : un script qui appelle `create_booking` directement (le honeypot ne
    le gêne pas) avec des numéros inventés peut réserver tous les créneaux des 4 semaines.
  - **Blocage du numéro d'un tiers** : en réservant 2 RDV avec le téléphone ou l'email de
    quelqu'un d'autre, on l'empêche de réserver ; la réponse `limit_reached` permet aussi de
    compter ses RDV futurs (risque n° 4 de l'ADR 0002).
  - Options à choisir : plafond global (`max_bookings_per_hour` dans `private.settings()`,
    vérifié sous le verrou global de `create_booking_at`) ; Cloudflare Turnstile avancé en V1.
  - **Fait (consigne 19)** : Alix peut annuler une fausse réservation ou débloquer le numéro
    d'un tiers depuis l'admin (le créneau et la limite sont libérés). Cela nettoie après coup,
    sans empêcher un script de saturer les créneaux : le plafond global reste à décider.

## Backlog (non planifié)

- [ ] Bouton « Ajouter à mon calendrier » (.ics) sur la confirmation de réservation (SPEC V1).
- [x] ~~Calendrier de /reserver : griser les jours sans créneau~~ : fait par la consigne 25 bis
      (issue #40, ADR 0010). Une seule requête pour les 4 semaines (nouvelle fonction
      `get_available_days`, migration `…_jours_disponibles.sql`) ; jour sans créneau = bouton
      radio `disabled` (et non `aria-disabled`, qui laisserait le jour atteignable aux flèches),
      grisé, barré et annoncé « aucun créneau disponible » ; jour disponible annonce son nombre de
      créneaux ; aucun jour disponible = message avec le lien Instagram. **Ordre de mise en
      production : `db push` AVANT la fusion** (sinon le calendrier retombe sur l'affichage
      d'avant, sans rien casser). Contrôle : `docs/audit/controle-jours-disponibles.sql`.
- [x] ~~Annulation d'un RDV par le barber~~ : faite par la consigne 19 (`admin_cancel_booking`,
      `cancelled_by = 'barber'`, pgTAP 14). Pas de motif enregistré (minimisation).

## V2

- [ ] Emails (Resend, nécessite un domaine) · Admin installable (PWA) · Captcha si spam
