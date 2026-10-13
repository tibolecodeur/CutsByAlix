# Déploiement sur Cloudflare Pages

> Toutes les valeurs ci-dessous sont **fictives** (`<ref>`, `site-barber`, `eyJ…factice`). Ne
> jamais écrire une vraie clé dans le dépôt, un ticket ou un message. Décision : ADR 0007.

## 1. Réglages du projet Cloudflare Pages

Tableau de bord Cloudflare → **Workers & Pages** → **Create** → **Pages** → connecter le dépôt
GitHub.

| Réglage                | Valeur                                       |
| ---------------------- | -------------------------------------------- |
| Framework preset       | `None` (ou `Vite` : mêmes valeurs)           |
| Branche de production  | `main`                                       |
| Build command          | `npm run build`                              |
| Build output directory | `dist`                                       |
| Root directory         | _(vide : la racine du dépôt)_                |
| Version de Node        | variable `NODE_VERSION` = `22` (comme la CI) |

`npm run build` lance `tsc -b` puis `vite build`. Le build **refuse** de se faire si
`NODE_ENV` vaut autre chose que `production` (`vite.config.ts`) : ne jamais définir `NODE_ENV`
dans le tableau de bord.

## 2. Variables d'environnement lues par le build

Le front ne lit que **deux** variables (`src/lib/supabase.ts`, `src/vite-env.d.ts`). Toute
variable `VITE_*` est **recopiée dans le JavaScript livré** : elle est publique par nature.

| Nom                      | Exemple (fictif)            | Où la trouver                                  |
| ------------------------ | --------------------------- | ---------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<ref>.supabase.co` | Supabase → Project Settings → API → URL        |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…factice`               | Supabase → Project Settings → API → clé `anon` |
| `NODE_VERSION`           | `22`                        | (réglage de build, pas lu par le site)         |

- À saisir dans **Settings → Variables and Secrets**, pour **Production** ET **Preview**
  (les aperçus en ont besoin aussi). Type « texte », pas « secret » : ces valeurs sont publiques.
- Elles sont lues **au moment du build** : après une modification, relancer un déploiement.
- **Jamais la clé `service_role`** (ni « secret key ») : elle contourne toute la sécurité de la
  base. Elle n'apparaît nulle part dans le dépôt ; un test le vérifie
  (`src/test/hosting.test.ts`).
- Sans ces variables, le site se construit quand même et affiche « Impossible de charger les
  prestations pour le moment ».

## 3. Réglages Supabase Auth (une fois l'URL connue)

Supabase → **Authentication → URL Configuration** :

- **Site URL** : l'URL de production, d'abord `https://site-barber.pages.dev` (nom du projet
  choisi chez Cloudflare), puis le domaine définitif s'il y en a un.
- **Redirect URLs** : la même URL suivie de `/**` (ex. `https://site-barber.pages.dev/**`). Pour
  tester un e-mail d'authentification sur un aperçu : `https://*.site-barber.pages.dev/**`.
  Retirer `localhost` en production.

Le site n'utilise ni lien magique, ni connexion par fournisseur externe, ni e-mail de
récupération (mot de passe temporaire fixé dans le SQL Editor, `docs/ADMIN-COMPTE.md` §5) : la
Site URL ne sert qu'aux liens des e-mails que Supabase Auth enverrait, et doit simplement
pointer vers le vrai site. Rien à régler pour le CORS : l'API Supabase accepte toutes les
origines, la sécurité repose sur la RLS et les fonctions RPC.

## 4. En-têtes HTTP (`public/_headers`)

| En-tête                                           | Où                                                               | Pourquoi                                    |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `X-Robots-Tag: noindex, nofollow`                 | tout le site (à retirer au lancement)                            | le site n'est pas encore public             |
|                                                   | aperçus `*.pages.dev`, `/annuler`, `/admin`                      | jamais indexés, même après le lancement     |
| `X-Content-Type-Options: nosniff`                 | tout le site                                                     | pas d'interprétation d'un fichier en script |
| `X-Frame-Options: DENY`                           | tout le site                                                     | jamais dans l'iframe d'un autre site        |
| `Content-Security-Policy: frame-ancestors 'none'` | `/admin*`                                                        | idem, version moderne, en blocage           |
| `Referrer-Policy`                                 | `strict-origin-when-cross-origin` ; `no-referrer` sur `/annuler` | le jeton ne part jamais                     |
| `Permissions-Policy`                              | tout le site                                                     | caméra, micro, géolocalisation… fermés      |
| `Content-Security-Policy-Report-Only`             | tout le site                                                     | signale sans bloquer (section 5)            |
| `Cache-Control: … immutable`                      | `/assets/*` uniquement                                           | fichiers à nom haché ; jamais `index.html`  |

**Piège** : si deux règles posent le même en-tête, Cloudflare envoie les deux valeurs séparées
par une virgule. Toute surcharge commence donc par `! Nom-De-L-En-Tete`. Le test
`src/test/hosting.test.ts` calcule les en-têtes effectifs de chaque URL et échoue en cas de
doublon.

### Vérifier en local, avant de pousser

```
npm run build
npx wrangler@4.141.0 pages dev dist --port 8788
curl -sI http://127.0.0.1:8788/annuler
```

Wrangler est lancé par `npx` à une version fixe, sans être ajouté au projet. Il applique
`_headers` et le repli SPA comme Pages. Il lit aussi `.env*` pour ses propres variables : il ne
les sert pas, mais ne pas lui donner de fichier contenant une clé secrète.

### Vérifier sur l'aperçu

```
curl -sI https://<hash>.site-barber.pages.dev/annuler
```

Attendu : `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow`, chaque en-tête une
seule fois.

## 5. CSP : de « Report-Only » au blocage

La CSP est d'abord en `Content-Security-Policy-Report-Only` : elle ne bloque rien, elle écrit
dans la **console du navigateur** chaque chargement qu'elle aurait bloqué (« [Report Only]
Refused to… »). Aucun service de collecte n'est branché.

**Mesure faite en local (2026-10-11)** : build de production servi par wrangler avec le vrai
`_headers`, toute la suite e2e rejouée (Android, iPhone, desktop), violations collectées :

1. `script-src` / `eval` sur toutes les pages : **Zod 4** teste au démarrage s'il peut compiler
   ses validations (`new Function("")`). **En blocage, rien ne casserait** (il se rabat sur un
   mode sans compilation), mais chaque page afficherait cette fausse alerte. **Corrigé** :
   `z.config({ jitless: true })` en tête de `src/lib/schemas.ts` (seul fichier qui importe Zod),
   avec un test qui simule une CSP interdisant `Function`. La mesure ci-dessus date d'avant cette
   correction : sur l'aperçu, la console doit être **vide**.
2. Rien d'autre côté site : polices, styles, scripts, images `blob:` (aperçu de photo) et
   appels Supabase passent. (Les seuls autres rapports venaient d'un test e2e qui lit l'aperçu
   par `fetch(blob:…)`, pas du site.)

Non couvert par cette mesure (à regarder sur l'aperçu, console ouverte) : vraies photos signées
de Supabase, vraie connexion admin et rafraîchissement de session, vidéo du hero (pas encore
fournie), installation de la PWA.

**Passer en blocage** (après validation) : renommer l'en-tête
`Content-Security-Policy-Report-Only` en `Content-Security-Policy` dans la règle `/*`, en y
ajoutant `frame-ancestors 'none'`, et retirer de `/admin*` la ligne
`Content-Security-Policy: frame-ancestors 'none'` (sinon deux CSP seraient envoyées).

## 6. Mise en ligne publique (plus tard)

- Retirer `X-Robots-Tag: noindex, nofollow` de la règle `/*` (les aperçus, `/annuler` et
  `/admin` gardent le leur).
- `robots.txt` reste **sans** `Disallow` : un robot qui ne peut pas lire une page ne voit pas son
  `noindex`.
- Domaine personnalisé : Cloudflare Pages → Custom domains ; mettre à jour la Site URL Supabase.
- Avec ce domaine, activer **HSTS** (`*.pages.dev` en bénéficie déjà via le préchargement de
  `.dev`, pas un domaine en `.fr` ou `.com`) : ajouter à la règle `/*`
  `Strict-Transport-Security: max-age=31536000; includeSubDomains`, ou le réglage HSTS du
  tableau de bord Cloudflare (pas les deux : doublon).

## 6 bis. Galerie : importer les photos de la vitrine (une fois, juste après la mise en ligne)

L'accueil n'affiche QUE les photos publiées depuis l'admin. Juste après le déploiement de la
galerie gérée, elle est donc vide (« Photos bientôt disponibles »). Pour la remplir :

1. Ouvrir `/admin/galerie` (galerie vide : le bloc « Photos de la vitrine » apparaît).
2. Cocher l'accord des personnes photographiées, toucher « Importer les 7 photos ».
3. Vérifier l'aperçu « Sur le site » et la galerie de l'accueil.

Si l'import s'arrête (réseau), « Reprendre l'import » continue sans doublon. Le bloc ne
réapparaît plus dès qu'une photo existe : supprimer une photo importée est définitif.

**Ensuite (revue sécurité)** : les originaux restent servis par `/media/galerie/` (jamais
indexés, `X-Robots-Tag: noindex, noimageindex`), même si Alix masque ou supprime une photo
dans l'admin. Une fois l'import fait en production, retirer dans un commit dédié le dossier
`public/media/galerie/`, `src/features/gallery/featuredPhotos.ts`, l'import
(`showcaseImport.ts`, `AdminShowcaseImport.tsx`) et leurs tests. Le dépôt étant public, les
fichiers restent dans l'historique git : un retrait total demanderait de réécrire l'historique.

## 7. Anti-pause Supabase

Le plan gratuit met le projet en pause après 7 jours sans activité. Le workflow
`.github/workflows/anti-pause.yml` fait **une** lecture publique (`services`, clé `anon`) tous les
3 jours, et échoue visiblement si la réponse n'est pas HTTP 200.

1. GitHub → Settings → Secrets and variables → Actions → **New repository secret** :
   `SUPABASE_URL` (`https://<ref>.supabase.co`) et `SUPABASE_ANON_KEY` (clé `anon`, jamais
   `service_role`).
2. Onglet Actions → « Anti-pause Supabase » → **Run workflow** : vérifier qu'il est vert.
3. Une semaine plus tard, vérifier dans Supabase que le projet n'a pas été mis en pause.

À savoir :

- **Ce n'est pas une sauvegarde** : il ne copie rien (`docs/SAUVEGARDES.md`).
- GitHub désactive les workflows planifiés d'un dépôt public après **60 jours sans activité**
  (un e-mail prévient) : il suffit de le réactiver dans l'onglet Actions.
- Un échec (projet en pause, clé changée) arrive par e-mail de GitHub : redémarrer le projet
  dans Supabase (Restore), puis relancer le workflow à la main.
