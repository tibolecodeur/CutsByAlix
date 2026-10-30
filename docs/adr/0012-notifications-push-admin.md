# ADR 0012 — Notifications push à l'admin

- **Date** : 2026-10-30
- **Statut** : accepté

## Contexte

Alix (iPhone) doit savoir tout de suite qu'un client a réservé ou annulé, sans ouvrir le site.
Contraintes : coût 0 €, pas de nom de domaine pour l'instant (les e-mails de Resend vers d'autres
adresses que la sienne en exigent un), données clients minimales (RGPD), et l'espace admin est
déjà une PWA installable (`public/admin.webmanifest`).

Choix de Thibault (2026-10-30) : push seul ; sur l'écran verrouillé, « Nouvelle réservation »,
puis la date et l'heure, puis le prénom ; annulations notifiées aussi.

## Décision

**Web push standard** (RFC 8030 / 8291 / 8292) vers la PWA admin, déclenché par la base.

1. **Abonnement** : dans « Mon compte », Alix active les notifications sur son téléphone. Le
   navigateur crée un abonnement (adresse du service de push d'Apple et clés de l'appareil),
   enregistré par `admin_save_push_subscription` dans `push_subscriptions` (RLS, aucun droit de
   table, 5 appareils au plus : `private.settings().push_max_devices`).
2. **Déclenchement** : un trigger `AFTER INSERT OR UPDATE OF status` sur `bookings` appelle
   `private.notify_booking_event`, qui envoie par **pg_net** une requête HTTP à l'Edge Function
   `notify-booking`. Seulement pour une nouvelle réservation confirmée et une annulation **par le
   client** (pas celle qu'Alix fait lui-même).
3. **Envoi** : l'Edge Function lit le RDV et les abonnements par 3 fonctions réservées à
   `service_role` (`notify_*`), chiffre le message pour chaque appareil et le signe avec les clés
   VAPID, puis oublie les abonnements disparus (404 / 410).
4. **Affichage** : le service worker `public/admin-sw.js` (portée `/admin`, sans cache) montre la
   notification et ouvre la fiche du RDV au toucher.

Sécurité :

- L'URL de la fonction et un **secret partagé** sont dans **Supabase Vault**, jamais dans une
  migration. L'Edge Function refuse tout appel sans ce secret (comparaison en temps constant ;
  `verify_jwt = false`, car l'appelant est la base, pas un utilisateur). Sans secrets (base
  locale, CI), le trigger ne fait rien.
- pg_net ne transporte que le type d'évènement et l'id. Le contenu (date, prénom, prestation) est
  **chiffré de bout en bout** pour l'appareil : Apple le transporte sans pouvoir le lire.
- Une panne de notification ne fait **jamais** échouer une réservation : toute erreur est avalée
  dans `notify_booking_event`, et l'appel HTTP part après le COMMIT.
- Le chiffrement et la signature sont écrits avec la seule API WebCrypto
  (`supabase/functions/_shared/webpush.ts`, sans dépendance), vérifiés par Vitest sur le vecteur
  de test officiel de la RFC 8291.

## Alternatives étudiées

- **E-mail (Resend)** : gratuit, mais Mail peut retarder l'alerte ; un domaine sera nécessaire
  plus tard pour écrire aux clients. Pourra servir de secours.
- **SMS (Twilio, Brevo…)** : payant (environ 0,05 à 0,10 € par SMS), contraire au coût 0 €.
- **Bot Telegram, ntfy** : gratuits, mais données chez un tiers et une appli de plus pour Alix.
- **Librairie `web-push` (npm)** : dépend de l'API crypto de Node, pas garantie dans l'Edge
  Runtime ; WebCrypto suffit et se teste à l'identique dans Vitest.
- **Webhook de base créé dans le tableau de bord Supabase** : hors migrations (contraire à la
  règle « tout passe par une migration ») ; le trigger + pg_net fait la même chose, versionné.

## Conséquences

- Il faut iOS **16.4** ou plus, et l'espace admin **ajouté à l'écran d'accueil** : dans un onglet
  Safari, le push n'existe pas. La carte « Notifications » l'explique.
- Chaque appareil s'active séparément (iPhone, iPad…).
- Mise en route en production : clés VAPID, secrets de la fonction, déploiement de la fonction,
  secrets Vault (`docs/DEPLOIEMENT.md` § 8). Tant que ce n'est pas fait, le bouton « Envoyer une
  notification de test » répond que le serveur n'est pas encore branché.
- Le prénom du client s'affiche sur l'écran verrouillé d'Alix : choix assumé (consigne du
  2026-10-30). À mentionner dans la politique de confidentialité si besoin.
- Une notification réelle ne se teste que sur un vrai iPhone (`docs/TESTS-APPAREILS.md` § 2.13).
