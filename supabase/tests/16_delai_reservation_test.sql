-- Délai minimum de réservation à 2 h (consignes 21 puis 28) et lien avec l'annulation à 24 h.
-- « Maintenant » est FIXE : private.create_booking_at / get_booking_at / cancel_booking_at
-- reçoivent dimanche 18 octobre 2026, 8 h 30 à Paris (heure d'été). Rien ne dépend de la date du
-- jour. Limite de réservation : 10 h 30 le même jour.
--
-- Cas clé : un RDV réservé à 2 h 01 est ACCEPTÉ (il est à moins de 24 h) mais NON annulable en
-- ligne, tandis qu'un RDV à plus de 24 h reste annulable.
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

select plan(13);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true);

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Lun. 19/10 8 h 30 : exactement 24 h après « maintenant ».
  ('20000000-0000-4000-8000-000000000001', '2026-10-19 08:30 Europe/Paris', '2026-10-19 09:40 Europe/Paris'),
  -- Lun. 19/10 10 h : 25 h 30 après « maintenant ».
  ('20000000-0000-4000-8000-000000000001', '2026-10-19 10:00 Europe/Paris', '2026-10-19 11:10 Europe/Paris');

-- Raccourci : réserver à la date fixe (tous les autres paramètres sont ceux du site).
create function pg_temp.book(p_starts_at timestamptz, p_phone text) returns setof record
language sql as $$
  select * from private.create_booking_at(
    '2026-10-18 08:30 Europe/Paris', '10000000-0000-4000-8000-000000000001',
    p_starts_at, '20000000-0000-4000-8000-000000000001', 'Léa', 'Martin', p_phone, null, null);
$$;

-- Jeton d'un RDV, retrouvé par son téléphone.
create function pg_temp.token(p_phone text) returns uuid
language sql as $$ select cancel_token from public.bookings where phone = p_phone; $$;

-- ---------------------------------------------------------------------------
-- 1. Valeurs : réservation à 2 h, annulation toujours à 24 h.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select min_notice, cancel_notice from private.settings()$$,
  $$values (interval '2 hours', interval '24 hours')$$,
  'private.settings() : réservation 2 h, annulation 24 h (inchangée)');

-- ---------------------------------------------------------------------------
-- 2. Réservation : 1 h 59 refusée, 2 h 01 acceptée.
-- ---------------------------------------------------------------------------
-- Les deux dispos se chevaucheraient : on les pose l'une après l'autre. La dispo existe dans
-- les deux cas, c'est donc bien le délai qui refuse, pas l'absence de créneau.
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 10:29 Europe/Paris', '2026-10-18 11:39 Europe/Paris');
select throws_ok(
  $$select * from pg_temp.book('2026-10-18 10:29 Europe/Paris', '0700000001')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'P0001', 'too_soon', '1 h 59 avant : réservation refusée (too_soon)');
select is((select count(*) from public.bookings), 0::bigint, 'le refus n''a rien enregistré');
delete from public.availabilities where starts_at = '2026-10-18 10:29 Europe/Paris';

insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 10:31 Europe/Paris', '2026-10-18 11:41 Europe/Paris');
select lives_ok(
  $$select * from pg_temp.book('2026-10-18 10:31 Europe/Paris', '0700000002')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  '2 h 01 avant : réservation acceptée');

-- ---------------------------------------------------------------------------
-- 3. Réservé à moins de 24 h : accepté, mais pas annulable en ligne.
-- ---------------------------------------------------------------------------
select is(
  (select can_cancel from private.get_booking_at('2026-10-18 08:30 Europe/Paris', pg_temp.token('0700000002'))),
  false, 'RDV réservé à 2 h 01 : get_booking annonce « non annulable » (RDV à moins de 24 h)');
select throws_ok(
  $$select private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', pg_temp.token('0700000002'))$$,
  'P0001', 'too_late', 'RDV réservé à 2 h 01 : annulation refusée (too_late)');
select is(
  (select status from public.bookings where phone = '0700000002'),
  'confirmed', 'le refus n''a pas annulé le RDV');

-- ---------------------------------------------------------------------------
-- 4. Annulation : 24 h pile acceptée ; 23 h 59 refusée ; 24 h 01 acceptée.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from pg_temp.book('2026-10-19 08:30 Europe/Paris', '0700000003')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'RDV à 24 h pile : réservation acceptée');
select is(
  private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', pg_temp.token('0700000003')),
  true, '24 h pile avant le RDV : annulation acceptée');

select lives_ok(
  $$select * from pg_temp.book('2026-10-19 10:00 Europe/Paris', '0700000004')
      as (s timestamptz, e timestamptz, n text, l text, t uuid)$$,
  'RDV du 19/10 à 10 h : réservation acceptée');
-- 23 h 59 avant (« maintenant » = dim. 18/10 10 h 01).
select throws_ok(
  $$select private.cancel_booking_at('2026-10-18 10:01 Europe/Paris', pg_temp.token('0700000004'))$$,
  'P0001', 'too_late', '23 h 59 avant le RDV : annulation refusée (too_late)');
-- 24 h 01 avant (« maintenant » = dim. 18/10 9 h 59).
select is(
  private.cancel_booking_at('2026-10-18 09:59 Europe/Paris', pg_temp.token('0700000004')),
  true, '24 h 01 avant le RDV : annulation acceptée');
select is(
  (select status from public.bookings where phone = '0700000004'),
  'cancelled', 'le RDV annulé à plus de 24 h est bien « cancelled »');

select * from finish();
rollback;
