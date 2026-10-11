# ADR 0007 — Hébergement sur Cloudflare Pages

- **Date** : 2026-10-11
- **Statut** : accepté (remplace la mention « Vercel » de l'ADR 0001)

## Contexte

Le site est une application d'une seule page (Vite, React Router) : un dossier `dist/` de
fichiers statiques, sans serveur à nous. La base, l'authentification et les photos sont chez
Supabase. Contraintes : 0 €, aperçu en **https** pour tester
sur de vrais téléphones avant chaque mise en ligne, en-têtes HTTP de sécurité réglables, et
aucune donnée de visiteur envoyée à un tiers inutile (RGPD).

L'ADR 0001 prévoyait Vercel. La décision de passer à Cloudflare Pages date du 2026-10-10
(`docs/PLAN.md`) ; cet ADR la consigne.

## Décision

Le site est hébergé sur **Cloudflare Pages** (offre gratuite), relié au dépôt GitHub :

- chaque push sur `main` déploie la production, chaque branche obtient un **aperçu**
  `https://<hash>.<projet>.pages.dev` ;
- build `npm run build`, dossier de sortie `dist`, Node 22 (`NODE_VERSION=22`) ;
- en-têtes dans `public/_headers` (copié tel quel dans `dist/`) ;
- **pas** de `_redirects` ni de `404.html` : sans `404.html`, Pages sert `index.html` pour toute
  URL qui n'est pas un fichier, ce qui est exactement le repli d'une application d'une seule
  page (recharger `/admin` ou `/annuler#<jeton>` fonctionne) ;
- les deux seules variables lues par le build sont publiques (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) ; aucun secret côté Cloudflare.

Mode d'emploi et vérifications : `docs/DEPLOIEMENT.md`.

## Alternatives étudiées

- **Vercel** (prévu par l'ADR 0001)
  - _Pour_ : aperçus par branche, très simple pour un site Vite.
  - _Contre_ : l'offre gratuite « Hobby » est réservée à un usage non commercial ; un site qui
    sert à prendre des rendez-vous payants peut en sortir. Écarté.
- **Netlify**
  - _Pour_ : équivalent fonctionnel (`_headers`, aperçus), même syntaxe d'en-têtes.
  - _Contre_ : quota gratuit de minutes de build et de bande passante plus serré ; aucun gain
    par rapport à Cloudflare pour ce projet.
- **GitHub Pages**
  - _Pour_ : gratuit, déjà sur GitHub.
  - _Contre_ : aucun en-tête HTTP personnalisable (pas de `Referrer-Policy` sur `/annuler`, pas
    de CSP par en-tête, pas de `X-Frame-Options`), pas d'aperçu par branche, repli SPA par une
    astuce de `404.html`. Rédhibitoire pour la sécurité.

## Conséquences

**Positif**

- Bande passante et requêtes illimitées sur l'offre gratuite, CDN mondial, https automatique.
- En-têtes de sécurité versionnés dans le dépôt et testés (`src/test/hosting.test.ts`, étape
  « Fichiers d'hébergement dans dist/ » de la CI), vérifiables en local avec
  `npx wrangler@4.141.0 pages dev dist`.
- Aperçu https par branche : la checklist sur vrai téléphone (`docs/TESTS-APPAREILS.md`) se fait
  sur le vrai build de production.

**Négatif / à surveiller**

- **Cumul des en-têtes** : si plusieurs règles de `_headers` posent le même en-tête, Cloudflare
  envoie les deux valeurs séparées par une virgule (`DENY, DENY`), ce que certains navigateurs
  ignorent. Toute surcharge commence par `! Nom` (retrait de la valeur héritée). Un test
  calcule les en-têtes effectifs de chaque URL et échoue en cas de doublon.
- **Repli SPA** : il disparaît si un `404.html` apparaît un jour dans `dist/` (la CI le refuse).
  Une URL inconnue répond 200 avec `index.html` ; la page 404 est affichée par React.
- Un fichier d'`/assets/` absent (ancien nom après un déploiement) reçoit aussi `index.html`,
  avec l'en-tête de cache d'un an de `/assets/*`. Sans conséquence pratique : ce nom ne sera plus
  jamais demandé par une page à jour.
- Pages ajoute `Access-Control-Allow-Origin: *` sur les fichiers statiques : sans risque ici
  (aucune donnée privée n'est servie par Pages, tout passe par Supabase).
- Les aperçus `*.pages.dev` sont publics pour qui connaît l'URL : jamais de vraies données de
  test clients en production, et `noindex` sur tous les aperçus.
- Le plan gratuit de Supabase met le projet en pause après 7 jours sans activité, et ne fait pas
  de sauvegarde : workflow `anti-pause.yml` et `docs/SAUVEGARDES.md`.
