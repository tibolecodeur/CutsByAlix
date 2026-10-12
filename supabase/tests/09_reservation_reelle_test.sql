-- Réservation réelle (consigne 15) : règles aux limites, lieu, honeypot, limite anti-abus,
-- absence de fuite, droits d'exécution.
-- « Maintenant » est FIXE pour les règles : private.create_booking_at(p_now, …) reçoit
-- dimanche 18 octobre 2026, 8 h 30 à Paris (heure d'été). Limite des 5 h : le même jour, 13 h 30.
-- Horizon de 4 semaines : dimanche 15/11 8 h 30 (heure d'hiver : le passage du 25/10 est
-- traversé). Rien ne dépend de la date du jour, sauf la dernière partie (vraies RPC en anonyme,
-- avec now()), qui repart de tables vides et place ses dispos par rapport à now().
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

select plan(39);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true),
  ('20000000-0000-4000-8000-000000000002', 'Ville deux', true),
  ('20000000-0000-4000-8000-000000000003', 'Ville fermée', false);

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Mer. 21/10 10 h – 14 h, ville un : grille 10:00, 11:10, 12:20 (13:30 déborderait).
  ('20000000-0000-4000-8000-000000000001', '2026-10-21 10:00 Europe/Paris', '2026-10-21 14:00 Europe/Paris'),
  -- Jeu. 22/10 10 h – 12 h, lieu INACTIF.
  ('20000000-0000-4000-8000-000000000003', '2026-10-22 10:00 Europe/Paris', '2026-10-22 12:00 Europe/Paris'),
  -- Ven. 23/10 10 h – 12 h 20, ville deux : 10:00, 11:10.
  ('20000000-0000-4000-8000-000000000002', '2026-10-23 10:00 Europe/Paris', '2026-10-23 12:20 Europe/Paris'),
  -- Sam. 24/10 10 h – 11 h, ville un : 10:00.
  ('20000000-0000-4000-8000-000000000001', '2026-10-24 10:00 Europe/Paris', '2026-10-24 11:00 Europe/Paris'),
  -- Dim. 15/11 8 h 30 – 10 h 50, ville un : 8:30 (= horizon pile), 9:40 (au-delà).
  ('20000000-0000-4000-8000-000000000001', '2026-11-15 08:30 Europe/Paris', '2026-11-15 10:50 Europe/Paris');

-- Raccourci : réserver à la date fixe. Tous les autres paramètres sont ceux du site.
create function pg_temp.book(
  p_starts_at timestamptz, p_location_id uuid,
  p_first text default 'Léa', p_last text default 'Martin',
  p_phone text default '0612345678', p_email text default null, p_website text default null
) returns setof record
language sql as $$
  select * from private.create_booking_at(
    '2026-10-18 08:30 Europe/Paris', '10000000-0000-4000-8000-000000000001',
    p_starts_at, p_location_id, p_first, p_last, p_phone, p_email, p_website);
$$;

-- ---------------------------------------------------------------------------
-- 1. Délai de 5 h : 4 h 59 refusé, 5 h 01 accepté, 5 h pile accepté (la dispo existe dans tous
--    les cas : c'est bien le délai qui refuse, pas l'absence de créneau).
--    Maintenant = dim. 18/10 8 h 30 → limite à 13 h 30 le même jour.
-- ---------------------------------------------------------------------------
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 13:29 Europe/Paris', '2026-10-18 14:29 Europe/Paris');
select throws_ok(
  $$select * from pg_temp.book('2026-10-18 13:29 Europe/Paris', '20000000-0000-4000-8000-000000000001')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'too_soon', '4 h 59 avant : refusé (too_soon)');
delete from public.availabilities where starts_at = '2026-10-18 13:29 Europe/Paris';

insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 13:31 Europe/Paris', '2026-10-18 14:31 Europe/Paris');
select lives_ok(
  $$select * from pg_temp.book('2026-10-18 13:31 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Ana', 'Petit', '0600000011') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '5 h 01 avant : accepté');
-- On repart d'une base nette pour la limite exacte (le RDV de 13 h 31 chevaucherait celui de 13 h 30).
delete from public.bookings where phone = '0600000011';
delete from public.availabilities where starts_at = '2026-10-18 13:31 Europe/Paris';

insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 13:30 Europe/Paris', '2026-10-18 14:30 Europe/Paris');
select lives_ok(
  $$select * from pg_temp.book('2026-10-18 13:30 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Ana', 'Petit', '0600000001') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '5 h pile avant : accepté');

-- ---------------------------------------------------------------------------
-- 2. Horizon de 4 semaines (heure de Paris, changement d'heure traversé).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from pg_temp.book('2026-11-15 08:30 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Ana', 'Petit', '0600000002') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'horizon pile (15/11 8 h 30 à Paris) : accepté');
select throws_ok(
  $$select * from pg_temp.book('2026-11-15 09:40 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Ana', 'Petit', '0600000003') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'too_far', 'créneau suivant de la grille, au-delà de l''horizon : refusé (too_far)');

-- ---------------------------------------------------------------------------
-- 3. Cas nominal : récap sans adresse, jeton présent, RDV de la durée de la PRESTATION.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select s, e - s, n, l, t is not null
      from pg_temp.book('2026-10-21 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000001',
             '  Léa ', 'Martin', '06 12 34 56 78')
        as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  $$values ('2026-10-21 10:00 Europe/Paris'::timestamptz, interval '60 minutes', 'Coupe'::text,
            'Ville un'::text, true)$$,
  'nominal : début, durée de la prestation (60 min), prestation, ville, jeton');

-- ---------------------------------------------------------------------------
-- 4. Le créneau doit exister, dans CE lieu, actif, sur la grille, libre.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000002',
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'slot_unavailable', 'mauvais lieu (dispo de la ville un, ville deux demandée) : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-22 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000003',
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'slot_unavailable', 'lieu inactif : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 16:00 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'slot_unavailable', 'hors disponibilité : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 10:30 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'slot_unavailable', 'hors de la grille de 70 min : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'slot_unavailable', 'créneau déjà réservé : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', null,
      'Tom', 'Durand', '0698765432') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'lieu absent : refusé');

-- ---------------------------------------------------------------------------
-- 5. Honeypot et bornes des entrées brutes (avant toute regex).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Robot', 'Spam', '0611111111', null, 'https://spam.example')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'honeypot rempli : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      repeat('a', 201), 'Durand', '0698765432')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'prénom brut de 201 caractères : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', repeat(' ', 31) || '0698765432')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'téléphone brut de 41 caractères (même valide une fois nettoyé) : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', null, repeat('a', 310) || '@example.test')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'email brut de plus de 320 caractères : refusé');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432', null, repeat(' ', 201))
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'invalid_input', 'honeypot de 201 espaces : refusé');
select is((select count(*) from public.bookings where first_name in ('Robot', 'Tom')), 0::bigint,
  'aucun des refus n''a créé de RDV');

-- ---------------------------------------------------------------------------
-- 6. Limite : 2 RDV futurs par téléphone (écritures différentes) ou par email (alias +…).
--    Léa a déjà le RDV du 21/10 10 h (0612345678).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from pg_temp.book('2026-10-21 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Léa', 'Martin', '+33 6 12 34 56 78') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '2e RDV futur avec le même téléphone : accepté');
select throws_ok(
  $$select * from pg_temp.book('2026-10-21 12:20 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Léa', 'Martin', '06.12.34.56.78') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'limit_reached', '3e RDV futur avec le même téléphone : refusé');
select lives_ok(
  $$select * from pg_temp.book('2026-10-23 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000002',
      'Zoé', 'Bernard', null, 'zoe@example.test') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '1er RDV avec un email : accepté');
select lives_ok(
  $$select * from pg_temp.book('2026-10-23 11:10 Europe/Paris', '20000000-0000-4000-8000-000000000002',
      'Zoé', 'Bernard', null, 'zoe+deux@example.test') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '2e RDV avec un alias du même email : accepté');
select throws_ok(
  $$select * from pg_temp.book('2026-10-24 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Zoé', 'Bernard', '0700000009', ' ZOE@Example.test ') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'limit_reached', '3e RDV futur avec le même email (autre casse, autre téléphone) : refusé');
select lives_ok(
  $$select * from pg_temp.book('2026-10-24 10:00 Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Noé', 'Roux', '0700000010') as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'le créneau refusé pour cause de limite reste libre pour quelqu''un d''autre');

-- ---------------------------------------------------------------------------
-- 7. Aucune fuite dans ce que renvoient les RPC publiques : ni adresse, ni téléphone, ni
--    email, ni nom (colonnes déclarées, lues dans le catalogue).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
    where n.nspname = 'public'
      and p.proname in ('get_available_slots', 'create_booking', 'get_booking')
      and a.mode = 't'
      and a.name in ('private_address', 'phone', 'email', 'last_name', 'id')),
  0::bigint,
  'aucune RPC publique ne déclare adresse, téléphone, email, nom ou id en sortie');
select set_eq(
  $$select a.name::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
     where n.nspname = 'public' and p.proname = 'create_booking' and a.mode = 't'$$,
  array['starts_at', 'ends_at', 'service_name', 'location_label', 'cancel_token'],
  'create_booking renvoie exactement : début, fin, prestation, ville, jeton');
select set_eq(
  $$select a.name::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
     where n.nspname = 'public' and p.proname = 'get_available_slots' and a.mode = 't'$$,
  array['starts_at', 'ends_at', 'location_id', 'location_label'],
  'get_available_slots renvoie exactement : début, fin, id et libellé public du lieu');

-- ---------------------------------------------------------------------------
-- 8. Droits : anon seulement pour les 4 RPC, personne pour create_booking_at.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('anon',
  'public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text, uuid)', 'execute'),
  'anon peut exécuter create_booking');
select ok(not has_function_privilege('authenticated',
  'public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text, uuid)', 'execute'),
  'authenticated ne peut pas exécuter create_booking');
select ok(not has_function_privilege('authenticated', 'public.get_available_slots(uuid, date)', 'execute'),
  'authenticated ne peut pas exécuter get_available_slots');
select ok(not has_function_privilege('authenticated', 'public.get_booking(uuid)', 'execute'),
  'authenticated ne peut pas exécuter get_booking');
select ok(not has_function_privilege('authenticated', 'public.cancel_booking(uuid)', 'execute'),
  'authenticated ne peut pas exécuter cancel_booking');
select ok(
  not has_function_privilege('anon',
        'private.create_booking_at(timestamptz, uuid, timestamptz, uuid, text, text, text, text, text, uuid)', 'execute')
  and not has_function_privilege('authenticated',
        'private.create_booking_at(timestamptz, uuid, timestamptz, uuid, text, text, text, text, text, uuid)', 'execute'),
  'personne (anon, authenticated) ne peut appeler create_booking_at, ni choisir « maintenant »');
select is(
  (select count(*) from pg_proc where proname = 'create_booking'),
  1::bigint,
  'l''ancienne signature de create_booking (sans lieu) n''existe plus');

-- ---------------------------------------------------------------------------
-- 9. Les vraies RPC, en anonyme, avec now() : on repart de tables vides et on place une dispo
--    d'une heure (un seul créneau)
--    à J+3 (toujours au-delà des 5 h, toujours dans les 4 semaines).
-- ---------------------------------------------------------------------------
delete from public.bookings;
delete from public.availabilities;
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000002',
   ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
   ((now() at time zone 'Europe/Paris')::date + 3 + time '11:00') at time zone 'Europe/Paris');

set local role anon;
select results_eq(
  $$select location_id, location_label
      from public.get_available_slots('10000000-0000-4000-8000-000000000001',
             (now() at time zone 'Europe/Paris')::date + 3)$$,
  $$values ('20000000-0000-4000-8000-000000000002'::uuid, 'Ville deux'::text)$$,
  'anon : get_available_slots renvoie le lieu (id + ville) du créneau');
select is(
  (select count(*) from public.get_available_slots('10000000-0000-4000-8000-000000000001',
            (now() at time zone 'Europe/Paris')::date + 3) s
    where to_jsonb(s)::text like '%secrète%'),
  0::bigint,
  'anon : aucune adresse privée dans les créneaux');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Tom', 'Durand', '0698765432')$$,
  'P0001', 'slot_unavailable', 'anon : lieu différent de celui du créneau : refusé');
select is(
  (select count(*) from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
      '20000000-0000-4000-8000-000000000002', 'Tom', 'Durand', '0698765432', 'tom@example.test') b
    where b.cancel_token is not null
      and to_jsonb(b)::text not like '%secrète%'
      and to_jsonb(b)::text not like '%0698765432%'
      and to_jsonb(b)::text not like '%tom@example%'
      and to_jsonb(b)::text not like '%Durand%'),
  1::bigint,
  'anon : réservation acceptée, récap avec jeton, sans adresse ni coordonnées');
select is(
  (select count(*) from public.get_available_slots('10000000-0000-4000-8000-000000000001',
            (now() at time zone 'Europe/Paris')::date + 3)),
  0::bigint,
  'anon : le créneau réservé disparaît de la liste');
reset role;

select * from finish();
rollback;
