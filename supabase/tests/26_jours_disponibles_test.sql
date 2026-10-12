-- Jours disponibles (consigne 25 bis, ADR 0010) : private.get_available_days_at / get_available_days.
-- Un jour est « disponible » exactement quand compute_slots lui donne au moins un créneau : on le
-- vérifie jour par jour (cohérence), puis cas par cas à des dates FIXES (rien ne dépend du jour
-- où le test tourne). Les jours sont ceux de PARIS : créneaux à 23 h 30 et à 00 h 30, et les deux
-- changements d'heure de 2030 (31 mars et 27 octobre).
--   « maintenant » A : lundi 18 mars 2030, 8 h 30 à Paris (horizon : lundi 15 avril 8 h 30).
--   « maintenant » B : lundi 14 octobre 2030, 8 h 30 à Paris (le 27 octobre est dans l'horizon).
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

select plan(41);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants FICTIFS.
insert into public.services (id, name, duration_min, active) values
  ('16000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('16000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false);
insert into public.locations (id, public_label, active) values
  ('26000000-0000-4000-8000-000000000001', 'Lieu un', true),
  ('26000000-0000-4000-8000-000000000002', 'Lieu fermé', false);

-- Aucune plage ne se chevauche (tous lieux confondus).
insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Passé par rapport à A.
  ('26000000-0000-4000-8000-000000000001', '2030-03-10 09:00 Europe/Paris', '2030-03-10 10:00 Europe/Paris'),
  -- Mer. 20/03 10 h – 11 h : UN seul créneau (10:00).
  ('26000000-0000-4000-8000-000000000001', '2030-03-20 10:00 Europe/Paris', '2030-03-20 11:00 Europe/Paris'),
  -- Jeu. 21/03 14 h – 18 h : 14:00, 15:10, 16:20.
  ('26000000-0000-4000-8000-000000000001', '2030-03-21 14:00 Europe/Paris', '2030-03-21 18:00 Europe/Paris'),
  -- Ven. 22/03 14 h – 16 h 30 : 14:00 et 15:10 ; un RDV à 15:10 → il reste 14:00.
  ('26000000-0000-4000-8000-000000000001', '2030-03-22 14:00 Europe/Paris', '2030-03-22 16:30 Europe/Paris'),
  -- Sam. 23/03 10 h – 11 h : un seul créneau, pris par un RDV → le jour disparaît.
  ('26000000-0000-4000-8000-000000000001', '2030-03-23 10:00 Europe/Paris', '2030-03-23 11:00 Europe/Paris'),
  -- Dim. 24/03, lieu inactif.
  ('26000000-0000-4000-8000-000000000002', '2030-03-24 10:00 Europe/Paris', '2030-03-24 12:00 Europe/Paris'),
  -- Lun. 25/03 23 h 30 → mar. 26/03 3 h : 23:30 (le 25), 00:40 et 01:50 (le 26).
  ('26000000-0000-4000-8000-000000000001', '2030-03-25 23:30 Europe/Paris', '2030-03-26 03:00 Europe/Paris'),
  -- Mer. 27/03 0 h 30 – 1 h 30 : 00:30 (le 27). En UTC (hiver, +1) ce serait le 26 à 23:30.
  ('26000000-0000-4000-8000-000000000001', '2030-03-27 00:30 Europe/Paris', '2030-03-27 01:30 Europe/Paris'),
  -- Dim. 31/03, passage à l'heure d'été (2 h → 3 h) : 00:30, 01:40, 03:50.
  ('26000000-0000-4000-8000-000000000001', '2030-03-31 00:30 Europe/Paris', '2030-03-31 05:00 Europe/Paris'),
  -- Lun. 15/04 7 h – 11 h : horizon de A à 8 h 30 → 07:00 et 08:10 seulement.
  ('26000000-0000-4000-8000-000000000001', '2030-04-15 07:00 Europe/Paris', '2030-04-15 11:00 Europe/Paris'),
  -- Sam. 20/04 : au-delà de l'horizon de A.
  ('26000000-0000-4000-8000-000000000001', '2030-04-20 10:00 Europe/Paris', '2030-04-20 11:00 Europe/Paris'),
  -- Dim. 27/10, passage à l'heure d'hiver (3 h → 2 h) : 00:30, 01:40, 02:50 (été), puis 03:00
  -- (hiver) ; 04:10 dépasserait la fin de la plage. En UTC, les deux premiers tombent le 26.
  ('26000000-0000-4000-8000-000000000001', '2030-10-27 00:30 Europe/Paris', '2030-10-27 05:00 Europe/Paris');

insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone) values
  ('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
   '2030-03-22 15:10 Europe/Paris', '2030-03-22 16:10 Europe/Paris', 'Léa', 'Martin', '0612345678'),
  ('16000000-0000-4000-8000-000000000001', '26000000-0000-4000-8000-000000000001',
   '2030-03-23 10:00 Europe/Paris', '2030-03-23 11:00 Europe/Paris', 'Noé', 'Durand', '0612345679');

-- Nombre de créneaux d'un jour (0 si le jour n'est pas dans la liste), pour la prestation « Coupe ».
create function pg_temp.n(p_now timestamptz, p_day date) returns integer
language sql as $$
  select coalesce((select d.slot_count
                     from private.get_available_days_at(
                            p_now, '16000000-0000-4000-8000-000000000001') d
                    where d.day = p_day), 0);
$$;

-- ---------------------------------------------------------------------------
-- 1. Le résultat complet à « maintenant » A : seulement les jours avec créneau, dans l'ordre.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select day, slot_count from private.get_available_days_at(
      '2030-03-18 08:30 Europe/Paris', '16000000-0000-4000-8000-000000000001')$$,
  $$values (date '2030-03-20', 1), (date '2030-03-21', 3), (date '2030-03-22', 1),
           (date '2030-03-25', 1), (date '2030-03-26', 2), (date '2030-03-27', 1),
           (date '2030-03-31', 3), (date '2030-04-15', 2)$$,
  'maintenant A : exactement 8 jours, avec leur nombre de créneaux, dans l''ordre');

-- ---------------------------------------------------------------------------
-- 2. Cas par cas.
-- ---------------------------------------------------------------------------
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-20'), 1, 'un seul créneau : 1');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-21'), 3, 'trois créneaux : 3');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-22'), 1,
  'un RDV retire un créneau : il en reste 1');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-23'), 0,
  'le dernier créneau est pris : le jour n''est plus disponible');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-24'), 0, 'lieu inactif : aucun créneau');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-10'), 0, 'jour passé : aucun créneau');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-19'), 0, 'jour sans plage : aucun créneau');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-04-15'), 2,
  'dernier jour de l''horizon : seuls les créneaux avant 8 h 30 (07:00 et 08:10)');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-04-20'), 0, 'au-delà de 4 semaines : aucun créneau');

-- Jours de Paris, pas de l'UTC.
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-25'), 1, 'créneau à 23 h 30 (Paris) : le jour même');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-26'), 2,
  'créneaux à 00 h 40 et 01 h 50 : le lendemain (Paris)');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-27'), 1,
  'créneau à 00 h 30 (Paris) : ce jour-là, pas la veille comme en UTC');

-- Changements d'heure.
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-03-31'), 3,
  'passage à l''heure d''été (31 mars) : 3 créneaux, tous ce jour-là');
select is(pg_temp.n('2030-03-18 08:30 Europe/Paris', '2030-04-01'), 0, 'et aucun le lendemain');
select is(pg_temp.n('2030-10-14 08:30 Europe/Paris', '2030-10-27'), 4,
  'passage à l''heure d''hiver (27 octobre) : 4 créneaux, tous ce jour-là');
select is(pg_temp.n('2030-10-14 08:30 Europe/Paris', '2030-10-26'), 0,
  'et aucun la veille (en UTC, les deux premiers y tomberaient)');

-- Délai minimum de 5 h : le créneau de 10 h le 20 mars.
select is(pg_temp.n('2030-03-20 05:00 Europe/Paris', '2030-03-20'), 1,
  'maintenant + 5 h pile = 10 h : le créneau reste proposé');
select is(pg_temp.n('2030-03-20 05:01 Europe/Paris', '2030-03-20'), 0,
  'à 5 h 01, le créneau de 10 h est trop proche : le jour est indisponible');
select is(pg_temp.n('2030-03-20 06:00 Europe/Paris', '2030-03-21'), 3,
  'les jours suivants ne changent pas');

-- ---------------------------------------------------------------------------
-- 3. Listes vides : prestation inactive, inconnue, nulle, ou « maintenant » nul.
-- ---------------------------------------------------------------------------
select is_empty(
  $$select * from private.get_available_days_at(
      '2030-03-18 08:30 Europe/Paris', '16000000-0000-4000-8000-000000000002')$$,
  'prestation inactive : aucun jour');
select is_empty(
  $$select * from private.get_available_days_at(
      '2030-03-18 08:30 Europe/Paris', '16000000-0000-4000-8000-0000000000ff')$$,
  'prestation inconnue : aucun jour');
select is_empty(
  $$select * from private.get_available_days_at('2030-03-18 08:30 Europe/Paris', null)$$,
  'prestation nulle : aucun jour');
select is_empty(
  $$select * from private.get_available_days_at(null, '16000000-0000-4000-8000-000000000001')$$,
  '« maintenant » nul : aucun jour');
select is_empty(
  $$select * from private.get_available_days_at(
      '2030-05-01 08:30 Europe/Paris', '16000000-0000-4000-8000-000000000001')$$,
  'aucune plage dans l''horizon : liste vide');

-- ---------------------------------------------------------------------------
-- 4. Cohérence avec la liste des créneaux : pour CHAQUE jour de 2030-03-08 à 2030-04-28, le
--    nombre renvoyé égale celui de compute_slots (et un jour sans créneau n'est pas renvoyé).
-- ---------------------------------------------------------------------------
select is_empty(
  $$
  with expected as (
    select d.day, count(*)::integer as slot_count
      from generate_series(0, 51) as g (n)
     cross join lateral (select (date '2030-03-08' + g.n)::date as day) d
     cross join lateral private.compute_slots(
            '16000000-0000-4000-8000-000000000001', d.day, '2030-03-18 08:30 Europe/Paris') c
     group by d.day
  ),
  actual as (
    select day, slot_count from private.get_available_days_at(
      '2030-03-18 08:30 Europe/Paris', '16000000-0000-4000-8000-000000000001')
  )
  (select * from expected except select * from actual)
  union all
  (select * from actual except select * from expected)
  $$,
  'maintenant A : les jours et compteurs sont exactement ceux de compute_slots');
select is_empty(
  $$
  with expected as (
    select d.day, count(*)::integer as slot_count
      from generate_series(0, 40) as g (n)
     cross join lateral (select (date '2030-10-10' + g.n)::date as day) d
     cross join lateral private.compute_slots(
            '16000000-0000-4000-8000-000000000001', d.day, '2030-10-14 08:30 Europe/Paris') c
     group by d.day
  ),
  actual as (
    select day, slot_count from private.get_available_days_at(
      '2030-10-14 08:30 Europe/Paris', '16000000-0000-4000-8000-000000000001')
  )
  (select * from expected except select * from actual)
  union all
  (select * from actual except select * from expected)
  $$,
  'maintenant B : idem, autour du changement d''heure d''hiver');

-- ---------------------------------------------------------------------------
-- 5. Forme et droits.
-- ---------------------------------------------------------------------------
select is(pg_get_function_result('public.get_available_days(uuid)'::regprocedure),
  'TABLE(day date, slot_count integer)',
  'la fonction publique ne renvoie que un jour et un nombre');
select is((select provolatile::text from pg_proc where proname = 'get_available_days'
            and pronamespace = 'public'::regnamespace), 's', 'fonction publique en lecture seule (stable)');
select ok((select prosecdef from pg_proc where proname = 'get_available_days'
            and pronamespace = 'public'::regnamespace), 'fonction publique en security definer');
select ok((select proconfig @> array['search_path=""'] from pg_proc where proname = 'get_available_days'
            and pronamespace = 'public'::regnamespace), 'search_path vide (fonction publique)');
select ok((select proconfig @> array['search_path=""'] from pg_proc where proname = 'get_available_days_at'
            and pronamespace = 'private'::regnamespace), 'search_path vide (fonction privée)');

-- Une plage proche de maintenant (heure réelle), pour la fonction publique qui utilise now().
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('26000000-0000-4000-8000-000000000001',
   (((now() at time zone 'Europe/Paris')::date + 3)::timestamp + time '10:00') at time zone 'Europe/Paris',
   (((now() at time zone 'Europe/Paris')::date + 3)::timestamp + time '11:00') at time zone 'Europe/Paris');

set local role anon;
select is(
  (select count(*) from public.get_available_days('16000000-0000-4000-8000-000000000001')
    where day = (now() at time zone 'Europe/Paris')::date + 3),
  1::bigint, 'anon : la fonction publique renvoie le jour qui a un créneau');
select is(
  (select sum(slot_count) from public.get_available_days('16000000-0000-4000-8000-000000000001')),
  1::bigint, 'anon : et uniquement lui (les plages de 2030 sont hors horizon)');
select is_empty(
  $$select * from public.get_available_days('16000000-0000-4000-8000-000000000002')$$,
  'anon : prestation inactive, aucun jour');
select is_empty(
  $$select * from public.get_available_days(null)$$,
  'anon : prestation nulle, aucun jour (sur la fonction publique elle-même)');
select throws_ok(
  $$select * from private.get_available_days_at(now(), '16000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon : la fonction privée est inaccessible');
select throws_ok('select * from public.availabilities', '42501', null,
  'anon : toujours aucun accès direct aux plages');
reset role;

set local role authenticated;
select throws_ok(
  $$select * from public.get_available_days('16000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'un connecté (même admin) : la fonction publique est réservée à anon, comme les autres');
select throws_ok(
  $$select * from private.get_available_days_at(now(), '16000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'un connecté : la fonction privée est inaccessible');
reset role;

select ok(
  not has_function_privilege('public', 'public.get_available_days(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.get_available_days_at(timestamptz, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.get_available_days_at(timestamptz, uuid)', 'execute'),
  'PUBLIC n''exécute rien ; la fonction privée n''est exécutable par aucun rôle de l''API');

select * from finish();
rollback;
