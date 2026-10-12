-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : réservation, cas non couverts par 04, 08,
-- 09 et 16 : doublon exact, limite de 2 RDV contournée par l'écriture du contact, créneau
-- passé, hors grille, durée imposée par la base, prestation inactive, lieu différent.
-- « Maintenant » FIXE : samedi 1er juin 2030, 8 h 30 à Paris (create_booking_at).
begin;
create extension if not exists pgtap with schema extensions;
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

select plan(27);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('19000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('19000000-0000-4000-8000-000000000002', 'Ancienne prestation', 60, false),
  ('19000000-0000-4000-8000-000000000003', 'Longue', 90, true);
insert into public.locations (id, public_label, private_address, active) values
  ('29000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse factice un', true),
  ('29000000-0000-4000-8000-000000000002', 'Lieu deux', 'Adresse factice deux', true);
-- Mer. 12/06 10 h – 18 h (lieu un) : grille 10:00, 11:10, 12:20, 13:30, 14:40, 15:50, 17:00.
-- Jeu. 13/06 10 h – 18 h (lieu deux). Ven. 31/05 (déjà passé) 10 h – 12 h (lieu un).
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('29000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris', '2030-06-12 18:00 Europe/Paris'),
  ('29000000-0000-4000-8000-000000000002', '2030-06-13 10:00 Europe/Paris', '2030-06-13 18:00 Europe/Paris'),
  ('29000000-0000-4000-8000-000000000001', '2030-05-31 10:00 Europe/Paris', '2030-05-31 12:00 Europe/Paris');

create function pg_temp.book(
  p_starts_at timestamptz,
  p_phone text default '0612345678', p_email text default null,
  p_location_id uuid default '29000000-0000-4000-8000-000000000001',
  p_service_id uuid default '19000000-0000-4000-8000-000000000001'
) returns uuid
language sql as $$
  select cancel_token from private.create_booking_at(
    '2030-06-01 08:30 Europe/Paris', p_service_id, p_starts_at, p_location_id,
    'Léa', 'Martin', p_phone, p_email, null);
$$;

-- ---------------------------------------------------------------------------
-- 1. Doublon : le même créneau deux fois (même client, puis un autre).
-- ---------------------------------------------------------------------------
select isnt(pg_temp.book('2030-06-12 10:00 Europe/Paris', '0600000001'), null,
  'premier envoi : accepté');
select throws_ok($$select pg_temp.book('2030-06-12 10:00 Europe/Paris', '0600000001')$$,
  'P0001', 'slot_unavailable', 'même créneau, même client (double envoi) : refusé');
select throws_ok($$select pg_temp.book('2030-06-12 10:00 Europe/Paris', '0600000002')$$,
  'P0001', 'slot_unavailable', 'même créneau, autre client : refusé');
-- Même heure, AUTRE lieu : le barber n'est qu'à un endroit à la fois (dispos sans chevauchement :
-- ce créneau n'existe pas), donc refusé aussi.
select throws_ok(
  $$select pg_temp.book('2030-06-12 10:00 Europe/Paris', '0600000003', null, '29000000-0000-4000-8000-000000000002')$$,
  'P0001', 'slot_unavailable', 'même heure dans l''autre lieu : refusé');
-- Insertion directe (admin, postgres) : la contrainte d'exclusion reste le filet de sécurité.
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, first_name, last_name, phone)
    values ('19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
            '2030-06-12 10:30 Europe/Paris', 'X', 'Y', '0600000004')$$,
  '23P01', null, 'insertion directe chevauchante : refusée par la contrainte d''exclusion');

-- ---------------------------------------------------------------------------
-- 2. Limite de 2 RDV futurs : le même téléphone ou e-mail sous une autre écriture compte.
-- ---------------------------------------------------------------------------
select isnt(pg_temp.book('2030-06-12 11:10 Europe/Paris', '06 11 22 33 44'), null, 'tél. : RDV 1');
select isnt(pg_temp.book('2030-06-12 12:20 Europe/Paris', '+33 6 11 22 33 44'), null,
  'tél. : RDV 2 (+33, même numéro)');
select throws_ok($$select pg_temp.book('2030-06-12 13:30 Europe/Paris', '0033.6.11.22.33.44')$$,
  'P0001', 'limit_reached', 'tél. : 3e RDV sous la forme 0033… refusé');
select throws_ok($$select pg_temp.book('2030-06-12 13:30 Europe/Paris', '(06)11-22-33-44')$$,
  'P0001', 'limit_reached', 'tél. : 3e RDV avec parenthèses et tirets refusé');

select isnt(pg_temp.book('2030-06-13 10:00 Europe/Paris', null, 'zoe@example.test',
  '29000000-0000-4000-8000-000000000002'), null, 'e-mail : RDV 1');
select isnt(pg_temp.book('2030-06-13 11:10 Europe/Paris', null, '  ZOE@Example.TEST ',
  '29000000-0000-4000-8000-000000000002'), null, 'e-mail : RDV 2 (casse et espaces)');
select throws_ok($$select pg_temp.book('2030-06-13 12:20 Europe/Paris', null, 'zoe+promo@example.test',
  '29000000-0000-4000-8000-000000000002')$$,
  'P0001', 'limit_reached', 'e-mail : 3e RDV avec suffixe +promo refusé');
select throws_ok($$select pg_temp.book('2030-06-13 12:20 Europe/Paris', '0699999999', 'Zoe@example.test',
  '29000000-0000-4000-8000-000000000002')$$,
  'P0001', 'limit_reached', 'e-mail connu + NOUVEAU téléphone : refusé quand même');
-- Contournement connu (constat A-03) : les points d'une adresse Gmail ne sont pas normalisés.
-- On documente le comportement ACTUEL (accepté) ; à revoir avec le constat.
select isnt(pg_temp.book('2030-06-13 12:20 Europe/Paris', null, 'z.o.e@example.test',
  '29000000-0000-4000-8000-000000000002'), null,
  'constat A-03 : z.o.e@ compte comme une autre adresse que zoe@ (comportement actuel)');

-- Un RDV annulé ne compte plus dans la limite.
update public.bookings set status = 'cancelled', cancelled_by = 'client'
 where phone = '0611223344' and starts_at = '2030-06-12 11:10 Europe/Paris';
select isnt(pg_temp.book('2030-06-12 13:30 Europe/Paris', '0611223344'), null,
  'après une annulation, le client peut reprendre un 2e RDV');

-- ---------------------------------------------------------------------------
-- 3. Créneaux impossibles : passé, hors grille, durée, prestation, lieu.
-- ---------------------------------------------------------------------------
select throws_ok($$select pg_temp.book('2030-05-31 10:00 Europe/Paris', '0600000010')$$,
  'P0001', 'too_soon', 'créneau passé (veille) : refusé');
select throws_ok($$select pg_temp.book('2030-06-12 14:45 Europe/Paris', '0600000011')$$,
  'P0001', 'slot_unavailable', 'hors grille de 70 min (14 h 45 au lieu de 14 h 40) : refusé');
select throws_ok($$select pg_temp.book('2030-06-12 14:40:01 Europe/Paris', '0600000011')$$,
  'P0001', 'slot_unavailable', 'à une seconde de la grille : refusé');
select throws_ok($$select pg_temp.book('2030-06-12 18:00 Europe/Paris', '0600000012')$$,
  'P0001', 'slot_unavailable', 'à la fin de la dispo (ne tient pas en entier) : refusé');
select throws_ok($$select pg_temp.book('2030-06-12 14:40 Europe/Paris', '0600000013', null,
  '29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000002')$$,
  'P0001', 'invalid_input', 'prestation inactive : refusée');
select throws_ok($$select pg_temp.book('2030-06-12 14:40 Europe/Paris', '0600000013', null,
  '29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'invalid_input', 'prestation inconnue : refusée');
select throws_ok($$select pg_temp.book('2030-06-12 14:40 Europe/Paris', '0600000013', null,
  '29000000-0000-4000-8000-000000000002')$$,
  'P0001', 'slot_unavailable', 'bon créneau, mauvais lieu : refusé');
-- 90 min à 17 h finirait à 18 h 30, après la fin de la dispo.
select throws_ok($$select pg_temp.book('2030-06-12 17:00 Europe/Paris', '0600000014', null,
  '29000000-0000-4000-8000-000000000001', '19000000-0000-4000-8000-000000000003')$$,
  'P0001', 'slot_unavailable', 'prestation de 90 min qui déborde de la dispo : refusée');

-- ---------------------------------------------------------------------------
-- 4. Durée : ends_at est TOUJOURS calculée par la base (le client ne la fournit pas, et même
--    une écriture directe ne peut pas l'imposer).
-- ---------------------------------------------------------------------------
select isnt(pg_temp.book('2030-06-12 14:40 Europe/Paris', '0600000015'), null, 'RDV de 14 h 40');
select is(
  (select ends_at - starts_at from public.bookings where phone = '0600000015'),
  interval '60 minutes', 'ends_at = début + durée de la prestation');
update public.bookings set ends_at = starts_at + interval '5 hours' where phone = '0600000015';
select is(
  (select ends_at - starts_at from public.bookings where phone = '0600000015'),
  interval '60 minutes', 'ends_at modifié à la main : ignoré par le trigger');
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('19000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001',
        '2030-06-12 15:50 Europe/Paris', '2030-06-12 15:55 Europe/Paris', 'X', 'Y', '0600000016');
select is(
  (select ends_at - starts_at from public.bookings where phone = '0600000016'),
  interval '60 minutes', 'ends_at fourni à l''insertion (5 min) : remplacé par la durée réelle');

select * from finish();
rollback;
