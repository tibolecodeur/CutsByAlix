-- Règles de réservation (migration regles_reservation_et_durcissement) : valeurs de
-- private.settings(), grille de 70 min, limites exactes de 5 h (réservation) et 24 h
-- (annulation), contrainte d'adresse sur les lieux, colonnes de services lisibles par anon.
--
-- Indépendant de la date du jour : la grille utilise un « maintenant » fixe ; les limites
-- 5 h / 24 h sont relatives à now(), qui reste FIGÉ pendant toute la transaction du test,
-- sur des données créées ici (truncate au début, aucune date fixe mélangée).
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

select plan(16);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, price_label, active, sort_order) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 70, '12 €', true, 1),
  ('10000000-0000-4000-8000-000000000002', 'Coupe + barbe', 70, '12 €', true, 2),
  ('10000000-0000-4000-8000-000000000003', 'Prestation masquée', 70, null, false, 3);
insert into public.locations (id, public_label) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un');

-- ---------------------------------------------------------------------------
-- 1. Valeurs des règles.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select slot_step, min_notice, max_advance, cancel_notice, max_future_bookings
      from private.settings()$$,
  $$values (interval '70 minutes', interval '5 hours', interval '28 days',
            interval '24 hours', 2)$$,
  'private.settings() : pas de 70 min, 5 h minimum, 4 semaines, annulation 24 h, 2 RDV');

-- ---------------------------------------------------------------------------
-- 2. Grille de 70 min. Dispo de 10 h à 14 h, prestation de 70 min :
--    dernier début possible 14:00 - 70 min = 12:50 → 10:00, 11:10, 12:20 (13:30 déborderait).
--    « Maintenant » fixe : jeudi 15 octobre 2026, 8 h à Paris.
-- ---------------------------------------------------------------------------
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001',
   '2026-10-20 10:00 Europe/Paris', '2026-10-20 14:00 Europe/Paris');

select results_eq(
  $$select to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI'),
           to_char(ends_at at time zone 'Europe/Paris', 'HH24:MI')
      from private.compute_slots('10000000-0000-4000-8000-000000000001', '2026-10-20',
                                 '2026-10-15 08:00 Europe/Paris')$$,
  $$values ('10:00', '11:10'), ('11:10', '12:20'), ('12:20', '13:30')$$,
  'dispo 10 h – 14 h : 3 créneaux de 70 min (10:00, 11:10, 12:20)');

-- La même grille vue 5 h avant : 10:00 est à 5 h pile de
-- « maintenant » (20/10 5 h) → proposé ; à 5 h 01, il ne l'est plus.
select is(
  (select count(*) from private.compute_slots('10000000-0000-4000-8000-000000000001',
     '2026-10-20', '2026-10-20 05:00 Europe/Paris')),
  3::bigint,
  'grille : un créneau à 5 h pile est proposé');
select is(
  (select count(*) from private.compute_slots('10000000-0000-4000-8000-000000000001',
     '2026-10-20', '2026-10-20 05:01 Europe/Paris')),
  2::bigint,
  'grille : un créneau à 4 h 59 n''est plus proposé');

delete from public.availabilities;

-- ---------------------------------------------------------------------------
-- 3. Réservation : 4 h 59 refusée, 5 h acceptée (create_booking, en anonyme).
-- ---------------------------------------------------------------------------
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001',
   now() + interval '4 hours 59 minutes', now() + interval '6 hours 9 minutes');

set local role anon;
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      now() + interval '4 hours 59 minutes', '20000000-0000-4000-8000-000000000001', 'Léa', 'Martin', '0612345678')$$,
  'P0001', 'too_soon', 'réservation à 4 h 59 : refusée (too_soon)');
select is(
  (select count(*) from public.get_available_slots('10000000-0000-4000-8000-000000000001',
     ((now() + interval '4 hours 59 minutes') at time zone 'Europe/Paris')::date)),
  0::bigint,
  'get_available_slots ne propose pas un créneau à 4 h 59');
reset role;

delete from public.availabilities;
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001',
   now() + interval '5 hours', now() + interval '6 hours 10 minutes');

set local role anon;
select is(
  (select count(*) from public.get_available_slots('10000000-0000-4000-8000-000000000001',
     ((now() + interval '5 hours') at time zone 'Europe/Paris')::date)),
  1::bigint,
  'get_available_slots propose un créneau à 5 h pile');
select results_eq(
  $$select ends_at - starts_at, location_label
      from public.create_booking('10000000-0000-4000-8000-000000000001',
        now() + interval '5 hours', '20000000-0000-4000-8000-000000000001', 'Léa', 'Martin', '0612345678')$$,
  $$values (interval '70 minutes', 'Lieu un'::text)$$,
  'réservation à 5 h pile : acceptée, RDV de 70 min');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Annulation : 23 h 59 refusée, 24 h acceptée. RDV écrits directement (en tant que
--    postgres) pour maîtriser l'heure exacte. Un RDV à la fois, pour
--    ne pas les faire se chevaucher.
-- ---------------------------------------------------------------------------
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001',
   now() + interval '23 hours', now() + interval '27 hours');

insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name,
                             phone, cancel_token)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        now() + interval '23 hours 59 minutes', now(), 'Tom', 'Durand', '0698765432',
        '40000000-0000-4000-8000-000000000001');

set local role anon;
select is(
  (select can_cancel from public.get_booking('40000000-0000-4000-8000-000000000001')),
  false,
  'get_booking : RDV dans 23 h 59, plus annulable');
select throws_ok(
  $$select public.cancel_booking('40000000-0000-4000-8000-000000000001')$$,
  'P0001', 'too_late', 'annulation à 23 h 59 du RDV : refusée (too_late)');
reset role;

delete from public.bookings where cancel_token = '40000000-0000-4000-8000-000000000001';
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name,
                             phone, cancel_token)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        now() + interval '24 hours', now(), 'Tom', 'Durand', '0698765432',
        '40000000-0000-4000-8000-000000000002');

set local role anon;
select is(
  (select can_cancel from public.get_booking('40000000-0000-4000-8000-000000000002')),
  true,
  'get_booking : RDV dans 24 h pile, encore annulable');
select is(public.cancel_booking('40000000-0000-4000-8000-000000000002'), true,
  'annulation à 24 h pile du RDV : acceptée');
reset role;

-- ---------------------------------------------------------------------------
-- 5. (Retirée, consigne 24) Contrainte « pas d'adresse provisoire sur un lieu actif » :
--    l'adresse n'est plus stockée. Ses cas sont repris dans 23_lieux_sans_adresse_test.sql.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. services : anon ne lit que les colonnes d'affichage, et toujours que les lignes actives.
-- ---------------------------------------------------------------------------
select is(
  array(select c.col from unnest(array['id', 'name', 'duration_min', 'price_label', 'sort_order',
                                       'active', 'created_at']) as c (col)
         where has_column_privilege('anon', 'public.services', c.col, 'SELECT')),
  array['id', 'name', 'duration_min', 'price_label', 'sort_order'],
  'anon : droit de lecture sur id, name, duration_min, price_label, sort_order seulement');

set local role anon;
select throws_ok('select * from public.services', '42501', null,
  'anon : select * sur services refusé');
select throws_ok('select created_at from public.services', '42501', null,
  'anon : services.created_at illisible');
select results_eq(
  $$select id, name, duration_min, price_label from public.services order by sort_order, name$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid, 'Coupe'::text, 70, '12 €'::text),
           ('10000000-0000-4000-8000-000000000002'::uuid, 'Coupe + barbe'::text, 70, '12 €'::text)$$,
  'anon : la requête du site (colonnes utiles, triées) ne renvoie que les prestations actives');
reset role;

select * from finish();
rollback;
