# ADR 0004 — Écritures admin des disponibilités par fonctions dédiées

- **Date** : 2026-10-11
- **Statut** : accepté

## Contexte

Consigne 18 : Alix crée et supprime ses plages de disponibilité depuis son téléphone. La base
doit refuser à elle seule (le front ne suffit pas) : une plage passée, une fin avant le début,
une plage plus courte qu'un créneau, un chevauchement, un lieu inactif, et tout appelant absent
de `admins`. Jusqu'ici, l'admin écrivait directement dans `availabilities` sous RLS. Il lisait
aussi toutes les colonnes de `locations`, `private_address` comprise, et pouvait les modifier.

Deux règles dépendent de l'heure (« dans le futur ») ou d'une autre table (« lieu actif ») :
une contrainte CHECK ne peut pas les porter.

## Décision

- Les écritures passent par des RPC `security definer` réservées aux admins :
  `admin_create_availability` (logique dans `private.admin_create_availability_at(p_now, …)`)
  et `admin_delete_availability`. Les lectures utiles à l'écran passent par
  `admin_list_availabilities` (nombre de créneaux et de RDV) et `admin_booking_rules` (valeurs
  de `private.settings()`).
- `authenticated` perd `insert, update, delete` sur `availabilities` et tout droit sur
  `locations`, sauf `select (id, public_label, active)`.
- La suppression est refusée dès qu'une réservation confirmée touche la plage, passée ou future.

## Alternatives étudiées

- **Écriture directe sous RLS + trigger de validation** : moins de code, mais le trigger lit
  `now()`, qui ne se fixe pas dans un test, donc les limites ne sont pas testables à date fixe.
  Le front devrait aussi deviner la règle violée à partir d'un code Postgres brut (23P01, nom
  de contrainte).
- **Validation au front uniquement** : contournable par un appel direct à l'API. Rejetée.

## Conséquences

- Même motif que les RPC publiques (`create_booking_at`, `cancel_booking_at`) : pgTAP teste
  « 69 min refusé / 70 min accepté », « début = maintenant refusé », le changement d'heure.
- Erreurs stables (`availability_overlap`, `too_short`…) traduites en français par le front.
- Le verrou consultatif `booking:slots` est partagé avec `create_booking_at` : une plage ne
  disparaît pas entre la vérification d'un créneau et l'insertion d'une réservation.
- L'admin ne peut plus créer, modifier ni activer un lieu, ni lire une adresse : tout se fait
  dans le SQL Editor par le développeur. Modifier une plage (non demandé) demandera une
  nouvelle fonction.
- Les contraintes de table et le trigger `availabilities_before_change` restent le filet,
  y compris pour une écriture faite dans le SQL Editor.
