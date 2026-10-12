-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : concurrence RÉELLE, cas non couverts par 10 :
--   1. double envoi simultané du MÊME formulaire (même client, même créneau) ;
--   2. limite de 2 RDV : deux réservations simultanées du même téléphone, sur deux créneaux
--      différents, alors qu'il en a déjà une (une seule doit passer) ;
--   3. deux annulations simultanées du même jeton (une seule renvoie true).
-- Même méthode et mêmes garde-fous que 10_concurrence_test.sql (dblink, base LOCALE seulement,
-- données VALIDÉES puis nettoyées, ids fixes « cd… », dates en 2030, aucun truncate).
-- « Maintenant » FIXE : 1er juillet 2030, 8 h 30 à Paris.
begin;
do $$
begin
  if inet_server_addr() is null
     or not (inet_server_addr() <<= any (array[
       '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128'
     ]::inet[]))
     or current_database() <> 'postgres'
  then
    raise exception '20_audit_concurrence_test.sql : base non locale, test abandonné.';
  end if;
end $$;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(10);

create function pg_temp.connstr() returns text
language sql as $$
  select format('host=%s port=%s dbname=%s user=postgres password=postgres',
                host(inet_server_addr()), current_setting('port'), current_database());
$$;

create function pg_temp.cleanup() returns void
language sql as $$
  select extensions.dblink_exec('setup', $sql$
    delete from public.bookings where service_id = 'cd000000-0000-4000-8000-000000000001';
    delete from public.availabilities where location_id = 'cd000000-0000-4000-8000-000000000002';
    delete from public.locations where id = 'cd000000-0000-4000-8000-000000000002';
    delete from public.services where id = 'cd000000-0000-4000-8000-000000000001';
  $sql$);
$$;

create function pg_temp.booking_sql(p_starts_at text, p_phone text) returns text
language sql as $$
  select format($sql$
    select cancel_token from private.create_booking_at(
      '2030-07-01 08:30 Europe/Paris', 'cd000000-0000-4000-8000-000000000001',
      %L::timestamptz, 'cd000000-0000-4000-8000-000000000002',
      'Test', 'Audit', %L, null, null)
  $sql$, p_starts_at, p_phone);
$$;

create function pg_temp.count_confirmed(p_phone text) returns bigint
language sql as $$
  select n from extensions.dblink('setup', format($sql$
    select count(*) from public.bookings
     where service_id = 'cd000000-0000-4000-8000-000000000001'
       and status = 'confirmed' and phone = %L
  $sql$, p_phone)) as t(n bigint);
$$;

select extensions.dblink_connect('setup', pg_temp.connstr());
select extensions.dblink_connect('c1', pg_temp.connstr());
select extensions.dblink_connect('c2', pg_temp.connstr());

select pg_temp.cleanup();
select extensions.dblink_exec('setup', $sql$
  insert into public.services (id, name, duration_min, active)
  values ('cd000000-0000-4000-8000-000000000001', 'Test audit', 60, true);
  insert into public.locations (id, public_label, active)
  values ('cd000000-0000-4000-8000-000000000002', 'Ville audit', true);
  -- Grille : 10:00, 11:10, 12:20, 13:30.
  insert into public.availabilities (location_id, starts_at, ends_at)
  values ('cd000000-0000-4000-8000-000000000002',
          '2030-07-10 10:00 Europe/Paris', '2030-07-10 14:30 Europe/Paris');
$sql$);

-- ---------------------------------------------------------------------------
-- 1. Double envoi simultané du même formulaire (double appui, deux onglets).
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('c1', 'begin');
select is(
  (select count(*) from extensions.dblink('c1',
     pg_temp.booking_sql('2030-07-10 10:00 Europe/Paris', '0633333333')) as t(token uuid)),
  1::bigint, 'envoi 1 : accepté (transaction ouverte)');
select extensions.dblink_send_query('c2', pg_temp.booking_sql('2030-07-10 10:00 Europe/Paris', '0633333333'));
select pg_sleep(0.3);
select extensions.dblink_exec('c1', 'commit');
select is(
  (select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid)),
  0::bigint, 'envoi 2 identique : refusé');
select matches(coalesce(extensions.dblink_error_message('c2'), ''), 'slot_unavailable',
  'envoi 2 identique : refusé avec slot_unavailable');
select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid);
select is(pg_temp.count_confirmed('0633333333'), 1::bigint, 'un seul RDV créé pour le double envoi');

-- ---------------------------------------------------------------------------
-- 2. Limite de 2 RDV futurs sous concurrence : le client a déjà 1 RDV (10:00), il en envoie
--    deux autres EN MÊME TEMPS (11:10 et 12:20). Une seule peut passer.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('c1', 'begin');
select is(
  (select count(*) from extensions.dblink('c1',
     pg_temp.booking_sql('2030-07-10 11:10 Europe/Paris', '0633333333')) as t(token uuid)),
  1::bigint, '2e RDV : accepté (transaction ouverte)');
select extensions.dblink_send_query('c2', pg_temp.booking_sql('2030-07-10 12:20 Europe/Paris', '0633333333'));
select pg_sleep(0.3);
select extensions.dblink_exec('c1', 'commit');
select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid);
select matches(coalesce(extensions.dblink_error_message('c2'), ''), 'limit_reached',
  '3e RDV simultané : refusé (limit_reached)');
select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid);
select is(pg_temp.count_confirmed('0633333333'), 2::bigint, 'jamais plus de 2 RDV futurs');

-- ---------------------------------------------------------------------------
-- 3. Deux annulations simultanées du même jeton : une seule réussit.
-- ---------------------------------------------------------------------------
create temp table audit_token as
  select token from extensions.dblink('setup', $sql$
    select cancel_token from public.bookings
     where service_id = 'cd000000-0000-4000-8000-000000000001'
       and starts_at = '2030-07-10 11:10 Europe/Paris'
  $sql$) as t(token uuid);
create function pg_temp.cancel_sql() returns text
language sql as $$
  select format($sql$select private.cancel_booking_at('2030-07-01 08:30 Europe/Paris', %L::uuid)$sql$,
                (select token from audit_token));
$$;

select extensions.dblink_exec('c1', 'begin');
select is(
  (select ok from extensions.dblink('c1', pg_temp.cancel_sql()) as t(ok boolean)),
  true, 'annulation 1 : true (transaction ouverte)');
select extensions.dblink_send_query('c2', pg_temp.cancel_sql());
select pg_sleep(0.3);
select extensions.dblink_exec('c1', 'commit');
select is(
  (select ok from extensions.dblink_get_result('c2', false) as t(ok boolean)),
  false, 'annulation 2 simultanée : false (déjà annulé)');
select count(*) from extensions.dblink_get_result('c2', false) as t(ok boolean);
select is(pg_temp.count_confirmed('0633333333'), 1::bigint, 'le RDV annulé ne compte plus');

select pg_temp.cleanup();
select extensions.dblink_disconnect('c2');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
