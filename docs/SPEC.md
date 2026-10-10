# Cahier des charges — site barber

> Brouillon. Sera complété pendant la phase 0 (interview avec Claude). Les points « À confirmer »
> sont à valider avec le barber.

## Objectif

Permettre aux clients de réserver un créneau en ligne en moins d'une minute depuis leur téléphone,
et au barber (étudiant, disponibilités variables) de publier lui-même ses créneaux et ses créations.

## Utilisateurs

- **Client** : sans compte. Veut voir les créneaux libres, réserver vite, pouvoir annuler.
- **Barber (admin)** : un seul compte. Gère ses dispos, voit ses RDV, publie des photos. Surtout sur mobile.
- **~90 % des visiteurs (clients ET admin) seront sur téléphone** : voir « Contraintes mobiles ».

## Prestations

- **Coupe** : 60 min, prix à confirmer.
- **Coupe + barbe** : 60 min, prix à confirmer.

## Lieux

Le barber coupe dans deux lieux : **« Chez ses parents »** et **« Chez lui »**. C'est lui qui
choisit le lieu en publiant chaque disponibilité ; le client ne choisit pas, il voit le libellé
public du lieu à côté de chaque créneau.

- Le libellé public est visible de tous ; l'**adresse exacte est privée** : elle n'est révélée qu'à
  la personne qui a réservé (récap de réservation et lien personnel), et à l'admin.
- Le barber n'est qu'à un endroit à la fois : deux dispos ne se chevauchent jamais, et deux RDV
  non plus, tous lieux confondus.
- Le lieu est mémorisé dans la réservation : modifier une dispo plus tard ne change pas
  l'historique.
- Aucune vraie adresse dans le dépôt (public) : elles se saisissent directement en production.

## Fonctionnalités — V1 (MVP)

### Public

- Accueil : présentation, photo, CTA « Réserver », adresse / zone, contact (Instagram, téléphone).
- Prestations et tarifs (affichage). Paiement **sur place, en liquide**.
- Galerie des créations (photos + légende courte).
- Réservation : prestation → jour (calendrier) → créneau libre → prénom, nom, téléphone et/ou email
  → consentement RGPD → confirmation.
- Page de confirmation : récap, lien d'annulation personnel, bouton « Ajouter à mon calendrier » (.ics).
- Annulation via le lien personnel (`/annuler#<jeton>`, le jeton est dans le fragment : jamais envoyé au serveur), possible jusqu'à 24 h avant le RDV.
- Pages : mentions légales, politique de confidentialité.

### Admin (`/admin`, connexion email + mot de passe)

- Ajouter / modifier / supprimer des plages de disponibilité (ex. mardi 14h–18h). Duplication rapide
  d'une semaine sur l'autre.
- Liste des RDV à venir (jour / semaine), détail client, annulation par le barber.
- Galerie : ajout de photo depuis le téléphone, légende, ordre, publier / masquer.
- Prestations : nom, durée, prix affiché, actif / inactif.

## V2 (plus tard)

- Emails de confirmation / rappel / annulation (Resend) — nécessite un nom de domaine vérifié.
- Admin installable sur l'écran d'accueil (PWA) + notification à chaque nouvelle réservation.
- Captcha Cloudflare Turnstile si spam. SEO local (prérendu des pages vitrine, données structurées).

## Données

Détail et justification : `docs/adr/0002-modele-de-donnees-et-securite.md`.

- `services` : id, name, duration_min, price_label, active, sort_order
- `locations` : id, public_label, private_address, active, sort_order
- `availabilities` : id, location_id, starts_at, ends_at (timestamptz)
  → pas de chevauchement entre deux dispos, tous lieux confondus
- `bookings` : id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone, email,
  status (`confirmed` | `cancelled`), cancel_token (uuid), created_at
  → contrainte d'exclusion : pas de chevauchement entre réservations `confirmed`, tous lieux
  confondus ; RDV entièrement dans une dispo du même lieu ; ends_at calculé par la base
- `gallery_items` : id, image_path, caption, sort_order, published, created_at
- `admins` : user_id (référence auth.users)

## Règles de gestion

Valeurs confirmées par le barber le 2026-10-10 (sauf conservation des données), centralisées
dans `private.settings()` (une migration suffit pour les changer) :

- Créneaux proposés = disponibilités découpées toutes les **70 min** à partir du début de chaque
  dispo, selon la durée de la prestation, moins les RDV confirmés (tous lieux), moins les créneaux
  passés ou à moins de **48 h** (réservation au plus tard 48 h avant ; un créneau devient visible
  des clients à J+2).
- Pas de réservation au-delà de **4 semaines**.
- Annulation client possible jusqu'à **24 h** avant le RDV.
- Limite anti-abus : **2 RDV futurs** max par téléphone ou par email, + champ honeypot.
- Conservation des données clients : suppression **6 mois** après le RDV (purge à coder avant la
  mise en ligne).

## À confirmer avec le barber

- [ ] Prix affichés des deux prestations (durées : 60 min chacune)
- [x] Durée standard d'un créneau → 70 min
- [x] Où il coupe → deux lieux, « Chez ses parents » et « Chez lui », adresse révélée après réservation
- [ ] Vraies adresses des deux lieux (à saisir en production, jamais dans le dépôt)
- [x] Délai d'annulation client → 24 h, délai minimum → 48 h, horizon → 4 semaines
- [ ] Nom, logo, couleurs, ambiance, photos disponibles
- [ ] Réseaux sociaux à mettre en avant

## Contraintes

- Coût : 0 € (offres gratuites) hors nom de domaine éventuel.
- Mobile d'abord, chargement rapide, accessible.
- RGPD : données minimales, consentement, droit de suppression, mentions légales.

### Contraintes mobiles (~90 % des visiteurs, client ET admin)

- Conception mobile d'abord ; le desktop est une adaptation secondaire.
- Zones tactiles d'au moins **44 px** ; actions principales à portée de pouce (bas de l'écran).
- Rien qui dépende du survol (`:hover`) : tout doit marcher au doigt.
- Performance en **4G** : pages légères, images optimisées et en `loading="lazy"`.

### Compatibilité iOS (Safari) et Android (Chrome)

- Hauteurs plein écran en `100dvh`, jamais `100vh` (barre d'adresse mobile).
- Zones sûres `env(safe-area-inset-*)` pour tout élément collé en bas ou sur les côtés (encoche,
  barre d'accueil).
- Champs de formulaire à **16 px** minimum (sinon Safari zoome à la saisie).
- Dates manipulées uniquement en ISO via date-fns (Safari refuse certains formats de `new Date()`).
- Comportement du clavier virtuel vérifié sur chaque formulaire (champ visible, bouton accessible).
- Navigateurs supportés : **Safari iOS 16.4+** et **Chrome Android récent** (limite de Tailwind v4).

### Animations

- Uniquement `transform` et `opacity` ; pas de flou ni d'ombre animés.
- `prefers-reduced-motion` toujours respecté.
- Testées sur un vrai iPhone et un vrai Android.
