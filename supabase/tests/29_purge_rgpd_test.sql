-- Purge RGPD (K-03) : les réservations sont supprimées 8 mois après la FIN du RDV, qu'elles
-- soient confirmées ou annulées. « Maintenant » est FIXE (1er juillet 2027, 12 h UTC) : la
-- limite est calculée avec la même expression que la fonction, dans un fuseau fixé (UTC), pour
-- ne dépendre ni de la date du jour ni d'un changement d'heure.
begin;
create extension if not exists pgtap with schema extensions;
-- Rend l'EXECUTE des fonctions pgTAP aux rôles de l'API, le temps du test.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
      join pg_depend d on d.objid = p.oid and d.classid = 'pg_proc'::regclass
      join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;

set local timezone = 'UTC';

select plan(14);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true);

-- « Maintenant » et la limite de conservation (c = maintenant - 8 mois).
create function pg_temp.now_fixed() returns timestamptz
language sql as $$ select timestamptz '2027-07-01 12:00 UTC' $$;
create function pg_temp.cutoff() returns timestamptz
language sql as $$
  select pg_temp.now_fixed() - (select data_retention from private.settings())
$$;

-- Une dispo 2 jours avant la limite, une autour de la limite (une dispo dure 24 h au plus),
-- une dans le futur.
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', pg_temp.cutoff() - interval '2 days 1 hour',
   pg_temp.cutoff() - interval '1 day 22 hours'),
  ('20000000-0000-4000-8000-000000000001', pg_temp.cutoff() - interval '3 hours',
   pg_temp.cutoff() + interval '3 hours'),
  ('20000000-0000-4000-8000-000000000001', '2027-07-10 08:00 UTC', '2027-07-10 18:00 UTC');

-- Les créneaux durent 70 min : ends_at = starts_at + 70 min (calculé par le trigger).
insert into public.bookings
  (service_id, location_id, starts_at, first_name, last_name, phone, status, cancelled_by)
values
  -- Fini 2 jours avant la limite : supprimé.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   pg_temp.cutoff() - interval '2 days', 'Vieux', 'Confirme', '0700000001', 'confirmed', null),
  -- ANNULÉ, fini 1 min avant la limite : supprimé aussi.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   pg_temp.cutoff() - interval '71 minutes', 'Vieux', 'Annule', '0700000002', 'cancelled', 'client'),
  -- Fini 1 min APRÈS la limite : gardé.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   pg_temp.cutoff() - interval '69 minutes', 'Recent', 'Confirme', '0700000003', 'confirmed', null),
  -- RDV futur : jamais touché.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2027-07-10 10:00 UTC', 'Futur', 'Confirme', '0700000004', 'confirmed', null);

-- ---------------------------------------------------------------------------
-- 1. Réglage : 8 mois.
-- ---------------------------------------------------------------------------
select is((select data_retention from private.settings()), interval '8 months',
  'private.settings() : conservation 8 mois');

-- ---------------------------------------------------------------------------
-- 2. Purge à date fixe.
-- ---------------------------------------------------------------------------
select is(private.purge_expired_bookings_at(pg_temp.now_fixed()), 2,
  'la purge supprime 2 réservations et le dit');
select is((select count(*) from public.bookings where phone = '0700000001'), 0::bigint,
  'RDV confirmé fini avant la limite : supprimé');
select is((select count(*) from public.bookings where phone = '0700000002'), 0::bigint,
  'RDV annulé fini 1 min avant la limite : supprimé');
select is((select count(*) from public.bookings where phone = '0700000003'), 1::bigint,
  'RDV fini 1 min après la limite : gardé');
select is((select count(*) from public.bookings where phone = '0700000004'), 1::bigint,
  'RDV futur : gardé');
select is(private.purge_expired_bookings_at(pg_temp.now_fixed()), 0,
  'rejouée, la purge ne supprime plus rien');
select throws_ok($$select private.purge_expired_bookings_at(null)$$,
  'P0001', 'invalid_input', 'date absente : refusée');
-- Horloge réelle : les RDV de 2027 sont dans le futur, rien n'est supprimé.
select is(private.purge_expired_bookings(), 0, 'purge à now() : aucun RDV récent supprimé');

-- ---------------------------------------------------------------------------
-- 3. Planification.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select schedule, command, active from cron.job where jobname = 'purge-donnees-clients'$$,
  $$values ('17 3 * * *'::text, 'select private.purge_expired_bookings()'::text, true)$$,
  'job pg_cron « purge-donnees-clients » chaque nuit à 3 h 17 UTC');

-- ---------------------------------------------------------------------------
-- 4. Aucun accès depuis l'API.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'private.purge_expired_bookings()', 'execute'),
  'anon ne peut pas lancer la purge');
select ok(not has_function_privilege('authenticated', 'private.purge_expired_bookings()', 'execute'),
  'authenticated ne peut pas lancer la purge');
select ok(not has_function_privilege('anon', 'private.purge_expired_bookings_at(timestamptz)', 'execute'),
  'anon ne peut pas lancer la purge à une date choisie');
select ok(not has_function_privilege('authenticated', 'private.purge_expired_bookings_at(timestamptz)', 'execute'),
  'authenticated ne peut pas lancer la purge à une date choisie');

select * from finish();
rollback;
