-- Concurrence RÉELLE de la réservation idempotente (consigne 25, C-05) : deux envois de la
-- MÊME clé, en même temps, depuis deux connexions. Une seule réservation, deux récapitulatifs
-- identiques (même jeton). Même principe que 10_concurrence_test.sql (dblink, données validées
-- en base LOCALE, ids fixes en 2030, nettoyage au début et à la fin, aucun truncate).
-- « Maintenant » est fixé (create_booking_at) : 1er juin 2030, 8 h 30 à Paris.
begin;
-- Garde-fou : jamais ailleurs que sur une base locale (voir 10_concurrence_test.sql).
do $$
begin
  if inet_server_addr() is null
     or not (inet_server_addr() <<= any (array[
       '127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128'
     ]::inet[]))
     or current_database() <> 'postgres'
  then
    raise exception '25_idempotence_concurrence_test.sql : base non locale, test abandonné.';
  end if;
end $$;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(6);

create function pg_temp.connstr() returns text
language sql as $$
  select format('host=%s port=%s dbname=%s user=postgres password=postgres',
                host(inet_server_addr()), current_setting('port'), current_database());
$$;

create function pg_temp.cleanup() returns void
language sql as $$
  select extensions.dblink_exec('setup', $sql$
    delete from public.bookings where service_id = 'ce000000-0000-4000-8000-000000000001';
    delete from public.availabilities where location_id = 'ce000000-0000-4000-8000-000000000002';
    delete from public.locations where id = 'ce000000-0000-4000-8000-000000000002';
    delete from public.services where id = 'ce000000-0000-4000-8000-000000000001';
  $sql$);
$$;

-- Même réservation, même clé : c'est un nouvel essai du même navigateur.
create function pg_temp.booking_sql() returns text
language sql as $$
  select $sql$
    select cancel_token from private.create_booking_at(
      '2030-06-01 08:30 Europe/Paris', 'ce000000-0000-4000-8000-000000000001',
      '2030-06-12 10:00 Europe/Paris', 'ce000000-0000-4000-8000-000000000002',
      'Test', 'Rejeu', '0639980099', null, null, 'bbbbbbbb-0000-4000-8000-000000000001')
  $sql$;
$$;

select extensions.dblink_connect('setup', pg_temp.connstr());
select extensions.dblink_connect('c1', pg_temp.connstr());
select extensions.dblink_connect('c2', pg_temp.connstr());

select pg_temp.cleanup();
select extensions.dblink_exec('setup', $sql$
  insert into public.services (id, name, duration_min, active)
  values ('ce000000-0000-4000-8000-000000000001', 'Test rejeu', 60, true);
  insert into public.locations (id, public_label, active)
  values ('ce000000-0000-4000-8000-000000000002', 'Ville rejeu', true);
  insert into public.availabilities (location_id, starts_at, ends_at)
  values ('ce000000-0000-4000-8000-000000000002',
          '2030-06-12 10:00 Europe/Paris', '2030-06-12 11:00 Europe/Paris');
$sql$);

-- Envoi 1 : réserve, SANS valider (il garde le verrou).
select extensions.dblink_exec('c1', 'begin');
create temp table first_token as
  select token from extensions.dblink('c1', pg_temp.booking_sql()) as t(token uuid);
select is((select count(*) from first_token), 1::bigint,
  'envoi 1 : réservation acceptée (transaction encore ouverte)');

-- Envoi 2 : même clé, sans attendre la réponse du premier.
select extensions.dblink_send_query('c2', pg_temp.booking_sql());
select pg_sleep(0.5);
select is(extensions.dblink_is_busy('c2'), 1,
  'envoi 2 : bloqué tant que l''envoi 1 n''a pas terminé (même verrou)');

-- L'envoi 1 valide : le 2 reprend, voit la ligne et renvoie le MÊME récapitulatif.
select extensions.dblink_exec('c1', 'commit');
create temp table second_token as
  select token from extensions.dblink_get_result('c2', false) as t(token uuid);
select is((select count(*) from second_token), 1::bigint, 'envoi 2 : un récapitulatif, pas d''erreur');
select is((select token from second_token), (select token from first_token),
  'envoi 2 : même jeton que l''envoi 1');
select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid);

select is(
  (select n from extensions.dblink('setup', $sql$
     select count(*) from public.bookings
      where service_id = 'ce000000-0000-4000-8000-000000000001'
   $sql$) as t(n bigint)),
  1::bigint,
  'une seule réservation en base');
select is(
  (select n from extensions.dblink('setup', $sql$
     select count(*) from public.bookings
      where request_key_hash = sha256(convert_to('bbbbbbbb-0000-4000-8000-000000000001', 'UTF8'))
   $sql$) as t(n bigint)),
  1::bigint,
  'elle porte l''empreinte de la clé');

select pg_temp.cleanup();
select extensions.dblink_disconnect('c2');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
