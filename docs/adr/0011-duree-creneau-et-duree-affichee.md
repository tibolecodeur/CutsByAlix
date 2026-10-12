# ADR 0011 — Durée du créneau et durée affichée d'une prestation

- **Date** : 2026-10-12
- **Statut** : accepté (consigne 26)

## Contexte

Alix fixe la coupe simple à 60 min (10 €) et garde 70 min pour la coupe + barbe (12 €). Il veut
néanmoins des créneaux de 70 min pour tout (marge de 10 min voulue). Or la fin d'un RDV
(`private.bookings_before_write()`) et la fin d'un créneau proposé (`private.compute_slots()`)
étaient calculées avec `services.duration_min` : une coupe à 60 min aurait fini 10 min trop tôt.

## Décision

`services.duration_min` ne sert qu'à l'affichage. La fin d'un RDV et d'un créneau est
début + `private.settings().slot_step` (70 min) pour toutes les prestations. La grille, la
contrainte d'exclusion et les autres règles ne changent pas. Une prestation doit toujours exister
(et être active pour être proposée).

## Alternatives

- Laisser la durée de la prestation dans le calcul : la coupe finirait à +60 min, le récapitulatif
  et la base divergeraient de l'agenda d'Alix.
- Créneaux de durée variable selon la prestation : non fait, à reconsidérer si Alix le demande.

## Conséquences

- Comportement inchangé en production (les deux prestations durent 70 min aujourd'hui).
- Les RDV existants gardent leur `ends_at` stocké.
- Une plage de disponibilité doit durer au moins 70 min, quelle que soit la prestation.
