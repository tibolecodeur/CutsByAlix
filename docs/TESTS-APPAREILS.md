# Tests sur appareils réels (iPhone et Android)

Les tests Playwright tournent sur Chromium (≈ Chrome Android) et WebKit (≈ Safari iOS), mais ce
sont des **simulations sur ordinateur** : pas de vrai clavier virtuel, pas d'encoche, pas de barre
d'adresse qui se replie, pas de vrai réseau mobile. Environ 90 % des visiteurs étant sur
téléphone, cette checklist se refait **à la main avant chaque mise en ligne**, sur :

- un **vrai iPhone** avec **Safari** (iOS 16.4 minimum, idéalement la dernière version) ;
- un **vrai Android** avec **Chrome** (version récente).

Copier la checklist dans la PR de mise en ligne et cocher au fur et à mesure.

## 1. Accéder au site depuis le téléphone

### Façon A — serveur local sur le même Wi-Fi (pendant le développement)

1. Brancher le PC et le téléphone sur **le même réseau Wi-Fi** (pas un Wi-Fi public ou d'école :
   ils isolent souvent les appareils entre eux).
2. Lancer le serveur en l'ouvrant au réseau :

   ```bash
   npm run dev -- --host
   ```

   Vite affiche une ligne `Network: http://192.168.x.x:5173/` : c'est l'adresse à taper dans le
   navigateur du téléphone.

3. **Pare-feu Windows** : au premier lancement, Windows demande s'il faut autoriser Node.js.
   Cocher **Réseaux privés uniquement**, puis vérifier que le Wi-Fi est bien en profil **Privé**
   (Paramètres > Réseau et Internet > Wi-Fi > _nom du réseau_ > Type de profil réseau).
   Si la fenêtre n'apparaît pas, créer la règle à la main dans un PowerShell administrateur :

   ```powershell
   New-NetFirewallRule -DisplayName "Vite (dev) 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
   ```

Limites de cette méthode :

- le site est servi en **http**, pas en https : certaines fonctions du navigateur réservées aux
  pages sécurisées ne marchent pas (presse-papiers, installation PWA…) ;
- si `.env.local` pointe vers un Supabase **local** (`http://127.0.0.1:54321`), le téléphone ne
  peut pas l'atteindre (`127.0.0.1` désigne le téléphone lui-même) : utiliser le projet Supabase
  de développement en ligne, ou remplacer `127.0.0.1` par l'IP du PC ;
- c'est le serveur de **développement** (non minifié) : la vitesse n'est pas représentative.

### Façon B — déploiement de prévisualisation (avant une mise en ligne)

Une fois le dépôt relié à Cloudflare Pages (`docs/DEPLOIEMENT.md`), chaque branche poussée
obtient une URL d'aperçu en **https** (`https://<hash>.<projet>.pages.dev`), avec le **build de
production** et les vrais en-têtes de `public/_headers`. C'est la méthode de référence pour la
checklist complète :

1. Pousser la branche : l'URL d'aperçu apparaît dans la PR (vérification « Cloudflare Pages »)
   et dans le tableau de bord Cloudflare.
2. Ouvrir cette URL sur le téléphone. Les aperçus ne sont pas protégés par mot de passe : ne pas
   diffuser le lien.
3. Couper le Wi-Fi pour tester en **vrai réseau mobile** (section 2.10).
4. Les aperçus utilisent la **vraie** base Supabase (variables « Preview ») : une réservation de
   test est une vraie réservation. L'annuler à la fin (section 2.12).

### Voir la console du téléphone (optionnel)

- **Android** : activer le débogage USB (Options pour les développeurs), brancher le téléphone,
  ouvrir `chrome://inspect` dans Chrome sur le PC. Fonctionne sous Windows.
- **iPhone** : l'inspecteur Web de Safari demande un **Mac** (Réglages > Safari > Avancé >
  Inspecteur Web). Sans Mac, se contenter des constats visuels.

## 2. Checklist

Pour chaque point : faire le test sur **chaque page** concernée (accueil, prestations, galerie,
réserver, annuler, admin), sur iPhone **et** Android.

### 2.1 Rotation

- [ ] Passer en paysage puis revenir en portrait sur chaque page : rien ne déborde, rien n'est
      coupé, pas de défilement horizontal.
- [ ] En paysage sur iPhone à encoche / Dynamic Island : aucun texte ni bouton caché sous
      l'encoche (marges `env(safe-area-inset-left/right)`).
- [ ] Tourner le téléphone **pendant** la saisie d'un formulaire : les valeurs saisies restent.

### 2.2 Barre d'adresse qui se replie

- [ ] Faire défiler vers le bas puis vers le haut : la barre d'adresse se replie et réapparaît
      sans que la page « saute » ni qu'un bloc plein écran soit coupé (hauteurs en `100dvh`,
      jamais `100vh`).
- [ ] iPhone : tester avec la barre d'onglets Safari **en bas** (réglage par défaut) **et** en
      haut (Réglages > Safari > Onglets).

### 2.3 Clavier virtuel (chaque formulaire : réservation, annulation, connexion admin)

- [ ] Le champ actif reste visible au-dessus du clavier.
- [ ] Le bouton de validation reste atteignable clavier ouvert (ou après l'avoir fermé).
- [ ] Le bon clavier s'ouvre : numérique pour le téléphone, avec `@` pour l'email.
- [ ] La touche « Suivant » / « OK » du clavier passe au champ suivant ou envoie le formulaire.
- [ ] La saisie automatique (prénom, nom, téléphone, email) propose les bonnes valeurs.
- [ ] Fermer le clavier ne laisse pas un espace vide ni une page décalée.

### 2.4 Zoom involontaire

- [ ] Toucher chaque champ de formulaire : **Safari ne zoome pas** (police des champs ≥ 16 px).
- [ ] Le double-tap rapide sur un bouton ne zoome pas la page.
- [ ] Le zoom à deux doigts reste **possible** (accessibilité : il ne doit jamais être bloqué).

### 2.5 Boutons collés en bas et zones sûres

- [ ] Tout élément collé en bas (barre d'action, bouton « Réserver »…) passe au-dessus de la
      barre d'accueil de l'iPhone (le trait en bas) et de la barre de gestes Android
      (`env(safe-area-inset-bottom)`, actif grâce à `viewport-fit=cover` dans `index.html`).
- [ ] Ces boutons restent atteignables au pouce, à une main, et font au moins 44 px de haut.
- [ ] Ils ne masquent pas le dernier contenu de la page (on peut défiler jusqu'en bas).

### 2.6 Défilement

- [ ] Défilement fluide, sans saccade, sur la galerie (images en `loading="lazy"`).
- [ ] Aucun défilement horizontal sur aucune page.
- [ ] Le « rebond » en haut et en bas de page ne fait pas apparaître de fond incohérent.
- [ ] Une fenêtre ou un menu ouvert ne fait pas défiler la page derrière.
- [ ] Retour arrière (geste ou bouton) : on revient à la page précédente, à la même position.

### 2.7 Liens `tel:` et `mailto:`

- [ ] Toucher le numéro de téléphone ouvre l'appel avec le bon numéro (iPhone : fenêtre de
      confirmation).
- [ ] Toucher l'email ouvre l'application de messagerie avec la bonne adresse.
- [ ] Le lien Instagram ouvre l'application (si installée) ou le site.

### 2.8 Ajout au calendrier (dès que la réservation existe)

- [ ] Le fichier `.ics` s'ouvre dans le Calendrier (iPhone) / Google Agenda (Android) avec la
      bonne date, la bonne heure (Europe/Paris) et le bon lieu.

### 2.9 Mode économie d'énergie

- [ ] iPhone (Réglages > Batterie > Mode Économie d'énergie) et Android (Économiseur de
      batterie) : le site reste utilisable, rien ne dépend d'une animation pour fonctionner.
- [ ] Avec « Réduire les animations » activé (iPhone : Accessibilité > Mouvement ; Android :
      Accessibilité > Supprimer les animations) : les animations sont désactivées
      (`prefers-reduced-motion`).

### 2.10 Connexion lente (4G)

- [ ] Wi-Fi coupé, en 4G réelle (façon B) : la page d'accueil s'affiche vite (noter le temps
      dans le journal ci-dessous), le parcours de réservation reste utilisable.
- [ ] Pendant un chargement, un état visible (chargement, bouton désactivé) empêche le double
      envoi du formulaire.
- [ ] Couper le réseau en pleine réservation : un message d'erreur clair s'affiche, sans page
      blanche.
- [ ] 4G simulée plus précise (facultatif) : Android via `chrome://inspect` > onglet Network >
      « Slow 4G » ; iPhone via Réglages > Développeur > Network Link Conditioner (menu visible
      seulement après avoir branché l'iPhone à un Mac avec Xcode).

### 2.11 Galerie admin : envoi de photos (iPhone ET Android, compte admin)

- [ ] « Prendre une photo » ouvre l'appareil photo arrière ; « Choisir dans la galerie » ouvre
      la photothèque. Une photo HEIC de l'iPhone est acceptée (iOS la convertit en JPEG).
- [ ] Photo prise **en portrait** : l'aperçu et la photo publiée sont droits (pas couchés).
- [ ] Photo d'une capture d'écran (PNG) et photo très grande (panorama) : acceptées, réduites.
- [ ] Télécharger la photo publiée depuis l'accueil (appui long > Enregistrer), puis regarder
      ses informations (iPhone : Photos > « i » ; Android : Google Photos > Détails) :
      **aucune position, aucune date de prise de vue, aucun modèle de téléphone**.
- [ ] « Publier » reste impossible tant que la case d'accord n'est pas cochée.
- [ ] Couper le réseau pendant l'envoi : message clair ; réessayer fonctionne.
- [ ] Masquer une photo : elle disparaît de l'accueil après rechargement.

### 2.12 Aperçu déployé : parcours réels (façon B, iPhone ET Android)

À faire sur l'aperçu Cloudflare Pages, avec la vraie base. Noter l'URL de l'aperçu et l'heure
dans le journal (section 3).

- [ ] **Réservation de bout en bout** : prestation → jour → créneau → coordonnées (prénom de
      test, vrai téléphone ou e-mail à soi) → confirmation. Le récapitulatif affiche la bonne
      heure de Paris, la ville, « En liquide, sur place », le lien d'annulation.
- [ ] Réserver un créneau à **moins de 24 h** : le récapitulatif et la confirmation préviennent
      que l'annulation en ligne sera impossible.
- [ ] **Annulation par le lien** : copier le lien, l'ouvrir dans un nouvel onglet (et après avoir
      fermé le navigateur) → « Annuler mon rendez-vous » → confirmation ; le créneau redevient
      réservable. Un lien de RDV à moins de 24 h affiche « Trop tard pour annuler en ligne ».
- [ ] Recharger `/annuler#<jeton>`, `/admin` et une URL inconnue : pas de page d'erreur de
      l'hébergeur (repli SPA), la page 404 du site pour l'URL inconnue.
- [ ] **Connexion admin** (`/admin`) avec le compte d'Alix ; déconnexion ; reconnexion.
- [ ] **Ajout de créneau** : créer une plage, vérifier le texte « réservable par les clients du
      … » ; elle apparaît côté client dans /reserver (si elle est à plus de 5 h).
- [ ] **Annulation côté barber** : annuler depuis l'admin la réservation de test ; le lien du
      client affiche « Rendez-vous annulé par Alix ».
- [ ] **Envoi d'une photo en galerie depuis un vrai téléphone** (« Prendre une photo » ET
      « Choisir dans la galerie », section 2.11) : l'appareil photo s'ouvre bien malgré
      `Permissions-Policy: camera=()` (qui ne concerne que l'accès direct à la caméra par le
      site, pas l'appareil photo du système).
- [ ] **URL signées** : les photos publiées s'affichent sur l'accueil (adresse en
      `…supabase.co/storage/v1/object/sign/…`) ; une photo masquée ne s'affiche plus. Les URL
      valent 1 h sans renouvellement : laisser la page ouverte plus d'une heure, faire défiler
      jusqu'aux photos pas encore chargées, et noter si elles s'affichent (limite connue).
- [ ] **Installation PWA depuis /admin uniquement** : sur `/admin`, « Ajouter à l'écran
      d'accueil » propose l'icône « Alix admin » et l'app s'ouvre sur `/admin` ; depuis l'accueil
      public, aucune proposition d'installation (pas de manifeste hors admin).
- [ ] **Console ouverte** (`chrome://inspect` sur Android, section 1) : relever les messages
      « [Report Only] Refused to… » de la CSP sur chaque page parcourue, et les reporter dans la
      PR (`docs/DEPLOIEMENT.md` §5). Attendu : seulement l'`eval` de Zod.
- [ ] En-têtes : `curl -sI <aperçu>/`, `<aperçu>/annuler`, `<aperçu>/admin` depuis le PC ;
      chaque en-tête présent **une seule fois**, `x-robots-tag: noindex, nofollow` partout.
- [ ] Nettoyage : annuler toutes les réservations de test, supprimer les photos de test.

## 3. Journal des passages

| Date | Version / PR | Appareil et système | Navigateur | Résultat et remarques |
| ---- | ------------ | ------------------- | ---------- | --------------------- |
