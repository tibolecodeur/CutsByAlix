# ADR 0005 — Réservations côté admin : lecture en deux niveaux et annulation par le barber

- **Date** : 2026-10-11
- **Statut** : accepté

## Contexte

Consigne 19 : Alix voit les réservations de ses clients et peut en annuler une. Aucun e-mail
n'est envoyé : c'est lui qui prévient le client, par téléphone ou SMS. Les coordonnées du client
ne doivent sortir que vers un admin. Il faut aussi pouvoir supprimer une fausse réservation ou
débloquer le numéro d'un tiers (limite de 2 RDV futurs, risque n° 4 de l'ADR 0002).
Jusqu'ici, `authenticated` gardait `select, insert, update, delete` sur `bookings` (sous RLS
admin), comme pour les plages avant l'ADR 0004.

## Décision

- Plus aucun droit de table sur `bookings` pour `authenticated`. Trois RPC `security definer`
  réservées aux admins, sur le modèle de l'ADR 0004 :
  - `admin_list_bookings('upcoming' | 'past')` : date, prestation, ville, prénom, nom, état,
    **sans téléphone ni e-mail**. « À venir » = pas encore terminés ; « Passées » = terminés
    depuis 30 jours au plus. Plafond de 200 lignes, pas de pagination.
  - `admin_get_booking(id)` : le détail, seul endroit où sortent le téléphone et l'e-mail
    (l'e-mail est parfois le seul moyen de contact : le téléphone est facultatif).
  - `admin_cancel_booking(id)` (logique dans `private.admin_cancel_booking_at(p_now, …)`) :
    sans délai de 24 h ; `false` si déjà annulé (double clic, rejeu) ; `already_started` si le
    RDV a commencé ; `not_found` sinon.
- Nouvelle colonne `bookings.cancelled_by` (`client` | `barber`, null tant que confirmé). Le
  lien client (`get_booking`) la renvoie : « annulé par Alix » s'affiche autrement que « déjà
  annulé ».
- **Le créneau annulé par Alix redevient réservable** (décision de Thibault du 2026-10-11) :
  rien à changer, la contrainte d'exclusion et le calcul des créneaux ne regardent que les RDV
  confirmés.
- La fenêtre de 30 jours est une constante commentée dans la fonction : c'est une fenêtre
  d'affichage, pas une règle de réservation, et l'ajouter à `private.settings()` obligerait à
  recréer toutes les fonctions qui la lisent (type de retour changé).

## Alternatives étudiées

- **Lecture directe de la table sous RLS** : moins de code, mais chaque écran recevrait toutes
  les colonnes, contact compris, et l'admin pourrait toujours écrire en direct (annuler sans
  `cancelled_by`, modifier un nom). Rejetée.
- **Une seule fonction de lecture avec le contact** : plus simple, mais la liste enverrait les
  téléphones et e-mails de tous les clients à chaque ouverture de l'écran. Rejetée
  (minimisation RGPD).
- **Créneau bloqué après une annulation par Alix**, ou choix à chaque annulation : utile si
  Alix annule parce qu'il n'est pas disponible, mais il faudrait recréer la contrainte
  d'exclusion et modifier `create_booking`, et une fausse réservation continuerait de bloquer
  son créneau. Écarté pour l'instant.

## Conséquences

- Alix nettoie lui-même les fausses réservations et débloque le numéro d'un tiers. Les
  réservations par script restent possibles : le plafond global reste à décider (phase 8).
- S'il annule parce qu'il n'est pas disponible, il doit ensuite supprimer la plage (possible
  dès qu'elle n'a plus de RDV confirmé), car on ne peut pas encore la modifier.
- `get_booking` change de type de retour (colonne ajoutée) : drop puis create, droits réécrits.
  Le front actuellement en production ignore la colonne en plus : migration PUIS front.
- Seul l'identifiant technique (uuid) passe dans l'URL du détail ; titres de page fixes ;
  erreurs réduites à des codes stables, jamais recopiées.
- Lectures admin en `volatile` : PostgREST refuse alors le GET, la réponse (qui contient le
  contact du client) ne peut pas être mise en cache par un navigateur ou un proxy.
- La policy `bookings_admin_all` est gardée comme filet : si un droit de table revenait par
  erreur, seul un admin verrait les lignes.
- Annulation à la main dans le SQL Editor : il faut écrire `cancelled_by = 'barber'` en plus
  de `status = 'cancelled'` (sinon la contrainte refuse, code 23514), ou passer par l'écran.
- Les RDV déjà annulés au moment de la migration reçoivent `cancelled_by = 'client'` (seul le
  client pouvait annuler par le site). Une annulation faite à la main en production avant la
  migration serait donc marquée « client » : à vérifier avant le `db push`.
- Le lien `mailto:` est encodé : la base accepte `?` et `&` dans un e-mail, un faux client
  pourrait sinon ajouter un destinataire au message d'Alix.
