# ADR 0010 — Jours disponibles : une fonction dédiée

- **Date** : 2026-10-12
- **Statut** : accepté (consigne 25 bis, issue #40)

## Contexte

Le calendrier de `/reserver` propose les 28 prochains jours. Le client découvrait qu'un jour était
vide en le touchant : la liste des créneaux ne se charge que pour **un seul jour**, celui qui est
touché (`get_available_slots(service, jour)`). On veut griser les jours sans créneau et mettre en
évidence les autres.

La disponibilité d'un jour dépend de choses que seule la base connaît : les plages publiées par
Alix, les RDV déjà pris, les lieux actifs, la grille de 70 min et le délai de 2 h. Le navigateur
ne peut pas la deviner.

## Décision

Une nouvelle fonction en lecture seule, **`get_available_days(service_id)`**, renvoie en UNE
requête les jours qui ont au moins un créneau, avec leur nombre de créneaux. Un jour absent de la
liste n'a aucun créneau.

- Elle s'appuie sur `private.compute_slots`, la fonction qui produit déjà la liste des créneaux :
  un jour est « disponible » exactement quand `get_available_slots` lui renverrait au moins une
  ligne. Aucune règle n'est recopiée. Un test pgTAP vérifie cette égalité jour par jour.
- Les jours sont ceux de **Paris** et sortent de la base sous forme `yyyy-MM-dd` : le navigateur
  ne regroupe rien et ne convertit aucun fuseau. Les créneaux à 23 h 30 et 00 h 30 et les deux
  changements d'heure sont testés côté SQL.
- Sécurité : `security definer`, `search_path` vide, `grant execute` à `anon` seulement (comme les
  autres fonctions publiques), la logique interne `private.get_available_days_at(p_now, …)` n'est
  exécutable par personne. Ni données client, ni adresse : seulement des jours et des nombres,
  que le client pourrait déjà obtenir en appelant `get_available_slots` jour par jour.
- `get_available_slots` n'est pas modifiée : toucher un jour disponible recharge ses créneaux
  comme avant (donnée fraîche au moment du choix).

Côté écran : un jour sans créneau est un bouton radio `disabled` (sorti du clavier, annoncé
« aucun créneau disponible », barré et grisé) ; un jour disponible annonce son nombre de
créneaux. Si aucun jour n'est disponible, l'écran l'explique et renvoie vers Alix sur Instagram.

## Alternatives étudiées

- **28 requêtes, une par jour** : trop de requêtes sur une 4G instable, et 28 chargements à
  coordonner. Écarté.
- **Une fonction qui renvoie tous les créneaux de la période** (~170 lignes, ~25 Ko) : plus
  complet, mais il faut réécrire le flux de l'étape et ses tests, et une liste déjà chargée peut
  être périmée au moment du clic. Écarté pour une consigne petite et isolée.
- **`aria-disabled` plutôt que `disabled`** : le jour resterait atteignable aux flèches et
  il faudrait bloquer sa sélection à la main. Un `disabled` natif est plus simple et sûr.

## Conséquences

- Le calendrier dépend d'un appel de plus (léger). S'il échoue, **la réservation n'est jamais
  bloquée** : le calendrier retombe sur l'affichage d'avant (tous les jours cliquables), avec un
  message et « Réessayer ».
- **Ordre de mise en production : la migration D'ABORD, la fusion ensuite.** Si le front part
  avant, la fonction est introuvable (`PGRST202`) : le calendrier fonctionne comme avant, sans
  grisé, avec le message ci-dessus. Rien ne casse.
- Une disponibilité peut changer entre l'affichage du calendrier et le clic (un autre client
  réserve le dernier créneau) : le jour paraît alors disponible mais la liste dit « Aucun créneau
  libre ». Ce cas existait déjà avec les créneaux, il n'est pas aggravé.
- Si le jour **déjà choisi** perd son dernier créneau pendant que le client est à l'étape
  suivante, il n'est jamais désactivé : il reste sélectionné (barré, mais visible), annoncé
  « aucun créneau disponible », et la liste dit « Aucun créneau libre ». La réservation n'est
  pas bloquée et la sélection ne devient pas invisible.
- La base peut renvoyer jusqu'au jour de l'horizon inclus (29 jours) ; le calendrier en affiche
  28, comme avant. Un créneau tombant uniquement le 29ᵉ jour n'était déjà pas proposé.
- Le calendrier n'apparaît qu'une fois les jours chargés (un message « Chargement » le
  remplace), au plus 10 s avant le repli : choix volontaire pour ne pas afficher un calendrier
  qui se grise ensuite sous le doigt.
- Coût : un appel équivaut à ~29 calculs de créneaux dans une seule requête (mesuré à 4,7 ms
  en local). Le volume est minuscule (quelques plages par semaine). Si un abus apparaissait, on
  limiterait le débit côté Cloudflare.
