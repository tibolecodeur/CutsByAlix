# ADR 0008 — Aucune adresse stockée sur le site

- **Date** : 2026-10-12
- **Statut** : accepté (remplace la « confidentialité de l'adresse » de l'ADR 0002)

## Contexte

Alix coupe dans deux lieux privés. L'ADR 0002 prévoyait de stocker l'adresse exacte de chaque
lieu (`locations.private_address`) et de ne la révéler qu'au client qui a réservé. Depuis la
consigne 15, plus aucune fonction ne la renvoie : il restait à décider **quand** la révéler (tard
avant le RDV, ou après validation par le barber). L'audit de la consigne 23 en a fait un bloquant
de mise en ligne (K-04 : « un client ne sait pas où aller »).

Le 2026-10-12, Alix a tranché (consigne 24) : il préfère donner l'adresse lui-même.

## Décision

Le site ne stocke et n'affiche **aucune adresse**. Le client voit seulement la localité du lieu
(« Les Ponts-de-Cé », « Saint-Christophe-du-Bois »). Pour avoir l'adresse exacte, il écrit à
Alix en message privé sur Instagram (@CutsByAlix). Le récapitulatif le dit avant la
confirmation, puis l'écran de confirmation le répète avec le lien du compte.

Migration `…_lieux_sans_adresse.sql` : suppression de la colonne `private_address` et des deux
contraintes qui en dépendaient, après une garde qui fait échouer la migration si un lieu contient
une vraie adresse. Le lieu « Angers » est renommé « Les Ponts-de-Cé » (même identifiant). Le
contact est défini une seule fois dans `src/lib/contact.ts`.

## Raisons

- **Minimisation des données** (RGPD) : on ne garde pas ce dont le site n'a pas besoin.
- **Aucun risque de fuite** : une adresse absente de la base ne peut fuiter ni par une RPC, ni par
  une erreur de droits, ni par une sauvegarde, ni par un jeton d'annulation volé.
- **Aucune règle de révélation à maintenir** : ni délai, ni validation par le barber, ni tests à
  garder à jour sur ce point.

## Alternatives étudiées

- **Révéler l'adresse quelques heures avant le RDV** : automatique, mais toute personne qui
  réserve avec de fausses coordonnées l'obtient, et la règle doit être codée et testée.
- **Révéler l'adresse après validation par le barber** : Alix filtre, mais il faut un écran de
  validation, un statut de réservation en plus, et un moyen de prévenir le client (pas d'e-mail
  en V1).
- **Adresse dans l'e-mail de confirmation** : pas d'e-mail en V1 (nom de domaine à acheter).

## Conséquences

- **Limite** : le client doit écrire à Alix, et Alix doit répondre à ses messages. Un client qui
  n'a pas Instagram ou n'écrit pas ne sait pas où aller. Le site le dit clairement, mais ne peut
  pas le vérifier.
- Le site dépend d'Instagram pour ce contact : si le pseudo change, il suffit de modifier
  `src/lib/contact.ts`.
- Les lieux restent inactifs jusqu'à la mise en ligne : leur activation ne dépend plus de la
  saisie d'une adresse.
- La fonction `private.is_placeholder_address()` (sans aucun droit d'exécution) reste en base
  pour que la garde de la migration soit testée en pgTAP (`23_lieux_sans_adresse_test.sql`).
  Ce n'est **pas** une règle active : aucune contrainte ni fonction ne l'appelle après la
  migration.
- `drop column` n'efface pas physiquement les anciennes valeurs tout de suite (pages de la table
  jusqu'à leur réécriture, sauvegardes Supabase). Sans conséquence ici : la garde garantit que
  ce n'étaient que des valeurs provisoires.
- L'écran de confirmation montre le lien Instagram **après** le lien d'annulation (le client le
  sauvegarde d'abord) et demande de ne pas envoyer ce lien à Alix : le jeton ne doit pas finir
  dans une messagerie.
- Le bloquant K-04 de l'audit est résolu par décision.
