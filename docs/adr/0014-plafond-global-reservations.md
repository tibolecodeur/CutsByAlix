# ADR 0014 — Plafond global de réservations (anti-abus)

- **Date** : 2026-11-25
- **Statut** : accepté

## Contexte

`create_booking` est appelable par n'importe qui (anon). Le honeypot n'arrête qu'un robot
naïf, et la limite de 2 RDV futurs est par téléphone ou e-mail : un script qui invente des
numéros peut prendre tous les créneaux des 4 semaines en quelques secondes (K-02 a de l'audit,
bloquant pour la mise en ligne). Contraintes : 0 €, pas de compte client, quelques RDV par jour.

## Décision

Plafond **global**, vérifié dans `private.create_booking_at` sous le verrou consultatif global
(étape 5 bis) : au plus **6 réservations créées par heure** et **20 par 24 h** (fenêtres
glissantes), sur tout le site. Les annulations du client comptent (une boucle « réserver
puis annuler » ne contourne rien) ; celles d'Alix non. Au-delà : exception `rate_limited`, message
« Beaucoup de réservations en ce moment. Réessaie un peu plus tard, ou écris à Alix sur
Instagram. » Valeurs dans `private.settings()` (`max_bookings_per_hour`,
`max_bookings_per_day`). Le rejeu d'une même réservation (ADR 0009) ne compte pas.

## Alternatives étudiées

- **Cloudflare Turnstile** (captcha vérifié par une Edge Function) : freine un robot, mais
  demande un compte, une clé secrète et une étape de plus pour le client. Reste possible en V2
  si le plafond ne suffit pas.
- **Plafond par adresse IP** : PostgREST ne transmet pas une IP fiable à la base sans
  configuration supplémentaire ; une IP se change facilement.
- **Confirmation du contact (SMS / e-mail)** : seule vraie parade au blocage d'un tiers, mais
  payante (SMS) ou dépendante d'un nom de domaine (e-mail, V2).

## Conséquences

- Un script ne peut plus saturer le planning d'un coup : il lui faut des jours, et Alix reçoit
  une notification à chaque réservation (ADR 0012). Elle annule les fausses depuis l'admin.
- **Plafond rempli exprès** : un attaquant peut faire 6 réservations par heure pour bloquer
  les vrais clients. Alix reçoit une notification pour chacune ; les annuler depuis l'admin libère
  aussitôt le plafond (ses annulations ne comptent pas). Sans plafond, le même attaquant
  prendrait tous les créneaux d'un coup. Parade suivante si ça arrive : Turnstile (V2).
- Un soir de forte demande (story Instagram), le 7e client de l'heure doit réessayer plus tard.
  À surveiller avec Alix ; les valeurs se changent par une migration.
- **Risque accepté** (K-02 b) : réserver 2 RDV avec le numéro d'un tiers bloque ce numéro, et
  `limit_reached` permet de savoir qu'un numéro a des RDV à venir. Alix peut annuler ces RDV
  (consigne 19), ce qui libère le numéro.
