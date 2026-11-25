# ADR 0013 — Purge RGPD des données clients

- **Date** : 2026-11-25
- **Statut** : accepté

## Contexte

Les réservations contiennent le prénom, le nom, le téléphone et/ou l'e-mail du client. Le RGPD
impose une durée de conservation limitée et effectivement appliquée. `private.settings()`
documentait 6 mois depuis la phase 2, mais rien ne supprimait les données (K-03 de l'audit,
bloquant pour la mise en ligne). Contraintes : 0 €, aucun serveur à nous, testable sans la
vraie base.

## Décision

- Durée : **8 mois après la FIN du rendez-vous**, qu'il ait eu lieu ou qu'il ait été annulé
  (décision de Thibault du 2026-11-25). Valeur unique dans `private.settings().data_retention`.
- Méthode : **suppression de la ligne** `bookings` entière (rien n'est gardé, pas même la date).
- Exécution : `private.purge_expired_bookings()`, planifiée chaque nuit à 3 h 17 UTC par
  **pg_cron** dans la base Supabase (job `purge-donnees-clients`). La logique est dans
  `private.purge_expired_bookings_at(p_now)`, testée à date fixe (pgTAP, `29_purge_rgpd_test.sql`).
- Aucun droit pour `anon` ni `authenticated` : la purge n'est pas exposée par l'API.

## Alternatives étudiées

- **Anonymisation** (garder date, prestation et lieu pour des statistiques) : utile plus tard,
  mais demande des colonnes nullables et des contraintes à revoir. Rien ne s'en sert
  aujourd'hui.
- **Edge Function planifiée ou GitHub Actions** : une clé `service_role` à stocker hors de la
  base, une panne de plus possible. pg_cron tourne là où sont les données.
- **Purge à la main par l'admin** : oubli certain.

## Conséquences

- Alix ne voit plus un RDV de plus de 8 mois dans l'admin (historique court, voulu).
- La politique de confidentialité affiche 8 mois (`RETENTION_MONTHS`, copie de la base), et
  dit qu'une sauvegarde chiffrée peut garder les données 6 semaines de plus (3 archives toutes
  les 2 semaines, `docs/SAUVEGARDES.md`).
- Le journal de pg_cron (`cron.job_run_details`, sans donnée client) est nettoyé chaque
  dimanche (30 jours gardés, job `nettoyage-journal-cron`).
- En production : vérifier après le `db push` que le job existe
  (`select * from cron.job`) et, le lendemain, qu'il a tourné (`select * from
cron.job_run_details order by start_time desc limit 5`).
- Changer la durée : une migration qui redéfinit `private.settings()`, et la copie du front.
