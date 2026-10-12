# ADR 0009 — Réservation idempotente (clé envoyée par le navigateur)

- **Date** : 2026-10-12
- **Statut** : accepté (consigne 25, constat C-05 de l'audit)

## Contexte

Sur un téléphone en 4G instable, la réservation peut être enregistrée par la base alors que la
réponse ne revient jamais au navigateur. Le client réessaie : le créneau est pris… par sa propre
réservation. Il voyait alors « Ce créneau n'est plus disponible », sans lien d'annulation, et
pouvait en réserver un autre (deux RDV comptés dans le plafond de 2). Il n'y a pas d'e-mail en V1
pour rattraper le lien.

## Décision

Le navigateur tire une **clé aléatoire** (uuid v4, `crypto.getRandomValues`) pour UNE
réservation : prestation, créneau et coordonnées. Tous les essais de cette réservation
renvoient la même clé (`p_request_id` de `create_booking`). La clé est décidée **au moment de
l'envoi** : le navigateur retient l'empreinte de la dernière réservation envoyée (prestation,
créneau, coordonnées nettoyées comme le fait la base : espaces au bord, séparateurs du
téléphone, casse de l'e-mail) et la clé qui va avec. Même empreinte = même clé ; sinon une
nouvelle. Effacer puis retaper le même prénom garde donc la clé et le rejeu.

La base (`private.create_booking_at`, migration `…_reservation_idempotente.sql`) :

- stocke l'**empreinte sha256** de la clé (`bookings.request_key_hash`, unique, sans aucun
  droit d'accès), jamais la clé ;
- si la clé est déjà connue avec **exactement** les mêmes données (prestation, créneau, lieu,
  prénom, nom, téléphone, e-mail normalisés), RDV confirmé et **encore à venir**, et dans les
  **30 minutes** qui suivent
  sa création (`request_replay_window` dans `private.settings()`) : elle ne crée rien et renvoie
  le **même récapitulatif, avec le même jeton** ;
- sinon (autres données, RDV annulé par le client ou par Alix, commencé, fenêtre dépassée) : `request_conflict`, sans rien révéler
  de la réservation existante. Le navigateur tire alors une nouvelle clé ;
- deux envois simultanés de la même clé passent l'un après l'autre (verrou global déjà utilisé
  par la réservation) : un seul RDV, deux récapitulatifs identiques ;
- le rejeu ne revérifie ni la fenêtre de réservation, ni le créneau, ni le **plafond de 2 RDV** :
  c'est le même rendez-vous, il ne compte qu'une fois.

Sans clé (ancienne version du site encore en cache), le comportement est celui d'avant.

## Pourquoi renvoyer le même jeton (et non en créer un nouveau)

`cancel_token` est stocké **en clair** (contrairement à ce que supposait la consigne) : on peut
le renvoyer. Obtenir le jeton demande la clé, un secret de 122 bits connu du seul navigateur qui
l'a tirée, envoyé en HTTPS dans le corps d'un POST : la même force que le jeton lui-même.
Régénérer le jeton à chaque rejeu ferait coexister deux réponses pour deux envois simultanés,
dont une seule resterait valable, et n'apporterait rien tant que le jeton n'est pas haché.

## Alternatives étudiées

- **Régénérer le jeton au rejeu** : utile seulement si le jeton était haché ; plus fragile
  (jetons concurrents). Écarté.
- **Retrouver la réservation par téléphone ou e-mail** : n'importe qui connaissant les
  coordonnées d'un client obtiendrait son lien d'annulation. Écarté.
- **Ne rien faire et compter sur l'e-mail** : pas d'e-mail en V1.

## Ordre de mise en production : la migration D'ABORD, le front ensuite

Cloudflare Pages déploie le site dès la fusion dans `main`. Il faut donc appliquer la migration
**avant** de fusionner. Mesuré en local le 2026-10-12, avec le vrai PostgREST :

| Base                                        | Ancien front (8 paramètres)                        | Nouveau front (9 paramètres, `p_request_id`)   |
| ------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| **sans** la migration (production actuelle) | fonctionne                                         | **HTTP 404 `PGRST202`** : fonction introuvable |
| **avec** la migration                       | fonctionne (`p_request_id` vaut `null` par défaut) | fonctionne                                     |

Si le nouveau front part avant la migration, **plus aucune réservation n'est possible** jusqu'au
`db push` : le client voit « La réservation n'a pas pu être envoyée. Vérifie ta connexion »
(message générique, rien de technique), rien n'est créé et aucune donnée n'est perdue. Les autres
écrans (prestations, créneaux, annulation) ne sont pas touchés. Dans l'ordre inverse, l'ancien
front encore en cache dans un navigateur continue de fonctionner sans rejeu possible.

Ordre : sauvegarde (`docs/SAUVEGARDES.md`), `npx supabase migration list`,
`npx supabase db push --dry-run`, `npx supabase db push` (jamais `--include-seed`),
requête de contrôle `docs/audit/controle-reservation-idempotente.sql` (tout doit être OK),
puis fusion de la PR.

## Limites

- La clé vit **en mémoire de la page** : elle ne survit pas à un rechargement. Une coupure
  suivie d'un rechargement retombe sur « créneau plus disponible » (la confirmation, elle,
  survit au rechargement une fois reçue : C-03).
- **Fenêtre de 30 minutes** : un client qui réessaie plus tard reçoit `request_conflict`, et la
  nouvelle clé tombera sur « créneau pris ». Une clé interceptée ne sert que pendant ce temps.
- Le **jeton reste stocké en clair** : son hachage est à planifier (`docs/PLAN.md`) ; il
  faudra alors revoir ce mécanisme (régénération).
- Sans `crypto.getRandomValues` (navigateurs hors cible), aucune clé n'est envoyée : pas de
  rejeu possible, comportement d'avant.
- **Pendant 30 minutes, la clé vaut le jeton.** Elle voyage comme lui, dans le corps JSON d'un
  POST en HTTPS, jamais dans une URL. Elle pourrait apparaître dans les journaux de PostgreSQL
  si la base journalisait les paramètres des requêtes en erreur ; c'est déjà le cas du jeton
  pour `get_booking` et `cancel_booking`. Aucun journal du site ne les écrit.
- Garde-fou « RDV encore à venir » : sans effet aujourd'hui (2 h de délai minimum contre 30 min
  de rejeu), il protège un futur réglage de `private.settings()` où le délai deviendrait plus
  court que la fenêtre de rejeu (testé : pgTAP 24, section 8).
