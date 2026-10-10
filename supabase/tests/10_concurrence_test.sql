-- Concurrence RÉELLE : deux réservations du même créneau, en même temps, depuis deux
-- connexions distinctes. Une seule doit passer.
--
-- Un test pgTAP tourne dans UNE transaction : il ne peut pas simuler deux clients. On ouvre
-- donc deux vraies connexions avec dblink, qui voient la base telle qu'elle est validée
-- (commit). Conséquences :
--   · les données du test sont VALIDÉES dans la base locale : ids fixes, dates en 2030 (loin
--     de toute dispo de seed-dev.sql), nettoyées au début ET à la fin ;
--   · ce fichier ne fait AUCUN truncate : la transaction du test garderait des verrous sur les
--     tables, et les deux connexions l'attendraient indéfiniment ;
--   · connexion par l'adresse réseau du serveur, avec le mot de passe par défaut de la base
--     LOCALE (« postgres », celui de `supabase start`) : dblink exige un mot de passe et les
--     connexions locales (127.0.0.1) sont en « trust ». Aucun secret : ce n'est valable
--     qu'en local et en CI.
-- « Maintenant » est fixé (create_booking_at) : 1er juin 2030, 8 h 30 à Paris.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(6);

create function pg_temp.connstr() returns text
language sql as $$
  select format('host=%s port=%s dbname=%s user=postgres password=postgres',
                host(inet_server_addr()), current_setting('port'), current_database());
$$;

-- Nettoyage (relançable même après un échec au milieu).
create function pg_temp.cleanup() returns void
language sql as $$
  select extensions.dblink_exec('setup', $sql$
    delete from public.bookings where service_id = 'cc000000-0000-4000-8000-000000000001';
    delete from public.availabilities where location_id = 'cc000000-0000-4000-8000-000000000002';
    delete from public.locations where id = 'cc000000-0000-4000-8000-000000000002';
    delete from public.services where id = 'cc000000-0000-4000-8000-000000000001';
  $sql$);
$$;

-- Réservation du créneau du 12/06/2030 10 h, à la date fixe, avec ce téléphone.
create function pg_temp.booking_sql(p_phone text) returns text
language sql as $$
  select format($sql$
    select cancel_token from private.create_booking_at(
      '2030-06-01 08:30 Europe/Paris', 'cc000000-0000-4000-8000-000000000001',
      '2030-06-12 10:00 Europe/Paris', 'cc000000-0000-4000-8000-000000000002',
      'Test', 'Concurrence', %L, null, null)
  $sql$, p_phone);
$$;

select extensions.dblink_connect('setup', pg_temp.connstr());
select extensions.dblink_connect('c1', pg_temp.connstr());
select extensions.dblink_connect('c2', pg_temp.connstr());

select pg_temp.cleanup();
select extensions.dblink_exec('setup', $sql$
  insert into public.services (id, name, duration_min, active)
  values ('cc000000-0000-4000-8000-000000000001', 'Test concurrence', 60, true);
  insert into public.locations (id, public_label, private_address, active)
  values ('cc000000-0000-4000-8000-000000000002', 'Ville test', 'Adresse factice (test)', true);
  insert into public.availabilities (location_id, starts_at, ends_at)
  values ('cc000000-0000-4000-8000-000000000002',
          '2030-06-12 10:00 Europe/Paris', '2030-06-12 11:00 Europe/Paris');
$sql$);

-- Client 1 : réserve, SANS valider sa transaction (il garde le verrou).
select extensions.dblink_exec('c1', 'begin');
select is(
  (select count(*) from extensions.dblink('c1', pg_temp.booking_sql('0611111111')) as t(token uuid)),
  1::bigint,
  'client 1 : réservation acceptée (transaction encore ouverte)');

-- Client 2 : même créneau, envoyé sans attendre la réponse.
select extensions.dblink_send_query('c2', pg_temp.booking_sql('0622222222'));
select pg_sleep(0.5);
select is(extensions.dblink_is_busy('c2'), 1,
  'client 2 : bloqué tant que le client 1 n''a pas terminé');

-- Client 1 valide : le client 2 reprend, voit le RDV et doit être refusé.
select extensions.dblink_exec('c1', 'commit');
select is(
  (select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid)),
  0::bigint,
  'client 2 : aucune réservation renvoyée');
select matches(extensions.dblink_error_message('c2'), 'slot_unavailable',
  'client 2 : refusé avec slot_unavailable');
-- Vide le résultat restant de la requête asynchrone (obligatoire avant de réutiliser c2).
select count(*) from extensions.dblink_get_result('c2', false) as t(token uuid);

select is(
  (select n from extensions.dblink('setup', $sql$
     select count(*) from public.bookings
      where service_id = 'cc000000-0000-4000-8000-000000000001' and status = 'confirmed'
   $sql$) as t(n bigint)),
  1::bigint,
  'un seul RDV en base pour ce créneau');
select is(
  (select phone from extensions.dblink('setup', $sql$
     select phone from public.bookings
      where service_id = 'cc000000-0000-4000-8000-000000000001'
   $sql$) as t(phone text)),
  '0611111111',
  'c''est le RDV du client 1, arrivé le premier');

select pg_temp.cleanup();
select extensions.dblink_disconnect('c2');
select extensions.dblink_disconnect('c1');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
