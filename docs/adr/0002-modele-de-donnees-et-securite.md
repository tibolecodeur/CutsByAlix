# ADR 0002 — Modèle de données, sécurité et confidentialité de l'adresse

- **Date** : 2026-10-05
- **Statut** : accepté

## Contexte

Le site stocke des données personnelles (prénom, nom, téléphone, email) et l'adresse où le barber
coupe : chez ses parents ou chez lui. Ce sont deux adresses privées. Le dépôt est public.
Contraintes :

- **Un créneau ne peut jamais être réservé deux fois**, même si deux requêtes arrivent en même
  temps. Le barber n'est qu'à un endroit à la fois.
- **Le visiteur n'a pas de compte** : il ne peut pas être authentifié pour lire « ses »
  réservations.
- **L'adresse n'est révélée qu'à quelqu'un qui a réservé**, jamais à un simple visiteur.
- Le projet Supabase distant n'expose **aucune** table par défaut et active la RLS
  automatiquement. Chaque droit doit donc être écrit.
- Les règles (durée de créneau, délais, limites) sont **encore à confirmer** avec le barber.

## Décision

**Modèle.** Six tables : `services`, `locations` (avec `public_label` et `private_address`),
`availabilities` (une plage de temps dans un lieu), `bookings` (qui copie le `location_id` de la
plage pour figer l'historique), `gallery_items` et `admins`. Tout est en `timestamptz`, affiché en
Europe/Paris.

**Intégrité garantie par PostgreSQL, pas par le front.**

- Contraintes d'exclusion GiST sur `tstzrange(starts_at, ends_at, '[)')` : aucune réservation
  confirmée ne chevauche une autre, et aucune dispo ne chevauche une autre, **tous lieux
  confondus**.
- Le trigger `bookings_before_write` calcule `ends_at` à partir de la durée de la prestation (il
  n'est jamais fourni par le client). Il vérifie aussi que le RDV tient entièrement dans une dispo
  **du même lieu**. Il s'applique aussi aux écritures directes de l'admin.
- Le trigger `availabilities_before_change` refuse de supprimer, raccourcir ou déplacer une dispo
  qui contient des RDV futurs confirmés.

**Accès.** Deux verrous successifs :

1. Les **GRANT**. `anon` ne peut que lire `services` et `gallery_items`. Tout le reste renvoie
   `permission denied`, ce qui est plus fort qu'une liste vide.
2. La **RLS**. Le public ne voit que les prestations actives et les photos publiées. L'admin
   (présent dans `admins`, vérifié par `private.is_admin()`) a tous les droits. Exception :
   `admins` est en lecture seule, et un admin ne s'ajoute qu'en SQL depuis le dashboard.

Le public passe **uniquement** par quatre fonctions RPC `security definer` avec
`search_path = ''` :

- `get_available_slots(service, jour)` : créneaux libres et libellé public du lieu, en un seul
  appel ;
- `create_booking(...)` : valide tout (honeypot, formats, prestation active, délais, créneau
  réellement proposé, limite de 2 RDV futurs par téléphone ou email sous verrou consultatif),
  insère, puis renvoie le récap ;
- `get_booking(token)` et `cancel_booking(token)` : accès **par `cancel_token` uniquement**. Un
  mauvais token ne renvoie rien et n'annule rien.

**Confidentialité de l'adresse.** `private_address` n'est lisible que par l'admin, et par le
porteur d'un `cancel_token` via `create_booking` ou `get_booking`. `get_booking` ne la renvoie
plus une fois le RDV annulé ou terminé. Aucune vraie adresse ne figure dans le dépôt : le seed
utilise des adresses factices, et les vraies se saisissent directement sur la base distante.

**Règles centralisées.** La fonction `private.settings()` est l'unique endroit qui contient :
pas de 60 min, réservation au moins 2 h à l'avance et au plus 4 semaines, annulation jusqu'à
2 h avant, 2 RDV futurs maximum, conservation 6 mois. Changer une valeur demande une seule
migration (`create or replace function`). L'horizon de 4 semaines est calculé en heure de Paris,
pour qu'il ne dépende ni du changement d'heure ni du fuseau de la session.

> Mise à jour du 2026-10-10 (migration `…_regles_reservation_et_durcissement`) : pas de 70 min,
> réservation au moins 48 h à l'avance, annulation jusqu'à 24 h avant (valeurs confirmées par
> le barber). Délais exprimés en heures, pas en jours, pour rester absolus au changement
> d'heure. Ajouts : contrainte « lieu actif = vraie adresse » et lecture de `services` par
> colonne pour anon.

## Alternatives étudiées

- **Lecture directe de `bookings` par l'anon avec une RLS filtrante**
  - _Pour_ : moins de SQL.
  - _Contre_ : sans compte, aucune condition RLS ne distingue « mes » réservations de celles des
    autres. Une erreur de policy exposerait toutes les données clients. Écarté.
- **Vérifier la disponibilité dans le front ou dans la RPC seulement**
  - _Pour_ : simple.
  - _Contre_ : une écriture admin ou deux requêtes simultanées contourneraient la règle. Les
    contraintes et les triggers ne se contournent pas.
- **Règles dans une table de configuration**
  - _Pour_ : modifiables depuis l'admin.
  - _Contre_ : une table de plus à protéger et à tester, pour des valeurs qui changent rarement.
    La consigne demande un changement par migration. Une fonction suffit.
- **Contrainte d'exclusion par lieu** (`location_id with =`)
  - _Contre_ : elle autoriserait deux RDV simultanés dans deux lieux, alors que le barber est seul.

## Risques acceptés pour l'instant

1. **Spam avec des numéros ou emails inventés.** La limite de 2 RDV futurs est par contact. Un
   script qui invente des numéros peut donc remplir les créneaux. Parade prévue : **Cloudflare
   Turnstile en V2**, plus, au besoin, une limite globale (ex. N réservations par heure) à
   ajouter dans `settings()`. Depuis la consigne 15 (migration `…_reservation_reelle.sql`),
   **aucune RPC ne renvoie plus l'adresse privée** (`create_booking`, `get_booking`) : réserver
   puis annuler ne la révèle plus. La règle de révélation reste à décider (la révéler tard, ou
   après validation par le barber) : **bloquant pour la mise en ligne**, case dédiée en phase 8
   de `docs/PLAN.md`.
2. **La purge RGPD n'est pas codée.** Les données clients doivent être supprimées 6 mois après le
   RDV, et `private.settings().data_retention` documente cette durée. **La purge DOIT être codée
   avant la mise en ligne** (case dédiée en phase 8 de `docs/PLAN.md`).
3. **Une photo masquée reste accessible par son URL.** Le bucket `gallery` est public, et
   `published = false` masque seulement la ligne. Parades : en phase 6, nommer les fichiers avec
   un uuid aléatoire, et supprimer le fichier, pas seulement la ligne.
4. **Blocage ciblé d'un client.** En réservant 2 créneaux avec le numéro ou l'email de
   quelqu'un d'autre, un tiers peut l'empêcher de réserver. `limit_reached` révèle aussi qu'un
   contact a atteint la limite. Depuis la consigne 15, le message affiché est neutre
   (« Réservation impossible avec ces coordonnées pour le moment… ») et ne dit pas si c'est le
   téléphone ou l'email. Limite résiduelle assumée : toute réponse « refusé / accepté » à des
   données valides trahit la limite ; mais la sonder sur le contact d'un tiers **crée un vrai
   RDV** à son nom tant que la limite n'est pas atteinte, visible du barber. Parades : Turnstile
   (V2) et la liste des RDV dans l'admin (phase 6), qui permet au barber de repérer et
   d'annuler ces réservations.
5. **Le MCP Supabase lit la base distante.** `read_only=true` empêche l'écriture, pas la lecture
   (en contournant la RLS). Une fois de vraies données clients en base, une session de debug
   pourrait faire passer des noms ou des téléphones dans le contexte de l'agent, y compris un
   texte d'injection saisi comme nom. **Avant la mise en ligne** : retirer la fonctionnalité
   `database` du MCP, ou le pointer vers un projet de développement sans vraies données.

## Conséquences

**Positif**

- Les règles critiques sont prouvées par plus de 140 assertions pgTAP, y compris « l'anonyme ne
  peut pas… » et le changement d'heure du 25 octobre 2026. Ces tests tournent en CI. Les
  requêtes simultanées sur un même créneau sont couvertes structurellement par la contrainte
  d'exclusion. En revanche, le verrou consultatif de la limite anti-abus n'est pas testé avec
  deux sessions réelles (cela demanderait `dblink`).
- Les caractères invisibles ou d'inversion de sens sont refusés par une seule fonction,
  `private.is_safe_text()`, utilisée à la fois par les contraintes de table et par
  `create_booking`.
- Le local se comporte comme le distant : `auto_expose_new_tables = false`, REVOKE et droits par
  défaut retirés dans la première migration.

**Négatif / à surveiller**

- La migration `socle_securite` retire l'EXECUTE par défaut de PUBLIC sur **toutes** les
  fonctions créées ensuite par `postgres`, quel que soit le schéma. Une extension activée plus
  tard, ou une nouvelle fonction, devra recevoir ses GRANT explicitement. Les tests pgTAP le font
  déjà pour pgTAP.
- `service_role` n'a pas les droits de lecture et d'écriture sur nos tables. Les Edge Functions de
  la V2 (emails) demanderont des GRANT ciblés.
- Le compte admin unique donne accès à toutes les données clients. Il faut un mot de passe
  robuste (12 caractères, majuscules, minuscules, chiffres) et une réauthentification pour
  changer de mot de passe. La MFA (TOTP) est à envisager. Ces réglages ne sont dans
  `config.toml` que pour le local : ils sont **à reproduire dans le dashboard** du projet distant.
- Un nom peut commencer par `+`, `-` ou `@`. Le jour où un export CSV existera, il faudra
  neutraliser ces valeurs (injection de formule dans un tableur).
- Côté front (phase 5), le `cancel_token` est dans l'URL de `/annuler`. Il faudra ajouter
  `Referrer-Policy: no-referrer` dans `vercel.json`.
