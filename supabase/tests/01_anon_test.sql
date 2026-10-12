-- Ce que l'anonyme (visiteur non connecté) ne peut PAS faire, et le peu qu'il peut faire.
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

select plan(20);

-- ---------------------------------------------------------------------------
-- Données de test (en tant que postgres), isolées du seed.
-- ---------------------------------------------------------------------------
truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('10000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false);

insert into public.locations (id, public_label) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un');

-- Dispo à J+3, 10 h – 14 h (heure de Paris) : toujours au-delà du délai minimum de 48 h.
insert into public.availabilities (location_id, starts_at, ends_at) values (
  '20000000-0000-4000-8000-000000000001',
  ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
  ((now() at time zone 'Europe/Paris')::date + 3 + time '14:00') at time zone 'Europe/Paris'
);
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values (
  '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
  ((now() at time zone 'Europe/Paris')::date + 3 + time '11:00') at time zone 'Europe/Paris',
  'Léa', 'Martin', '0612345678'
);

insert into public.gallery_items (image_path, alt_text, width, height, published, consent_at) values
  ('a1000000-0000-4000-8000-000000000001.webp', 'Publiée', 800, 600, true, now()),
  ('a1000000-0000-4000-8000-000000000002.webp', 'Masquée', 800, 600, false, null);

-- ---------------------------------------------------------------------------
-- À partir d'ici : visiteur anonyme.
-- ---------------------------------------------------------------------------
set local role anon;

-- Lecture interdite des tables privées (permission refusée, pas juste « 0 ligne »).
select throws_ok('select * from public.bookings', '42501', null,
  'anon ne peut pas lire bookings');
select throws_ok('select * from public.locations', '42501', null,
  'anon ne peut pas lire locations');
select throws_ok('select * from public.availabilities', '42501', null,
  'anon ne peut pas lire availabilities');
select throws_ok('select * from public.admins', '42501', null,
  'anon ne peut pas lire admins');
select throws_ok(
  $$select * from private.compute_slots('10000000-0000-4000-8000-000000000001', current_date, now())$$,
  '42501', null,
  'anon ne peut pas appeler les fonctions internes du schéma private');

-- get_available_slots : des créneaux, mais jamais l'adresse privée.
select ok(
  (select count(*) from public.get_available_slots(
     '10000000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Paris')::date + 3)) > 0,
  'anon obtient les créneaux libres via get_available_slots');
select is(
  (select count(*) from public.get_available_slots(
     '10000000-0000-4000-8000-000000000001', (now() at time zone 'Europe/Paris')::date + 3) s
    where to_jsonb(s) ? 'private_address' or to_jsonb(s)::text like '%Secrète%'),
  0::bigint,
  'get_available_slots ne révèle jamais private_address');

-- Écriture interdite partout.
select throws_ok(
  $$insert into public.services (name, duration_min) values ('Pirate', 60)$$,
  '42501', null, 'anon ne peut pas créer de prestation');
select throws_ok(
  $$update public.services set name = 'Pirate'$$,
  '42501', null, 'anon ne peut pas modifier une prestation');
select throws_ok(
  $$delete from public.services$$,
  '42501', null, 'anon ne peut pas supprimer une prestation');
select throws_ok(
  $$insert into public.availabilities (location_id, starts_at, ends_at)
    values ('20000000-0000-4000-8000-000000000001', now() + interval '3 days',
            now() + interval '3 days 2 hours')$$,
  '42501', null, 'anon ne peut pas créer de disponibilité');
select throws_ok(
  $$insert into public.gallery_items (image_path) values ('pirate.jpg')$$,
  '42501', null, 'anon ne peut pas ajouter de photo à la galerie');
select throws_ok(
  $$update public.gallery_items set published = true$$,
  '42501', null, 'anon ne peut pas publier une photo');
select throws_ok(
  $$insert into public.locations (public_label) values ('Pirate')$$,
  '42501', null, 'anon ne peut pas créer de lieu');
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            now() + interval '1 day', now() + interval '1 day 1 hour', 'A', 'B', '0600000000')$$,
  '42501', null, 'anon ne peut pas écrire directement dans bookings');
select throws_ok(
  $$insert into public.admins (user_id) values (gen_random_uuid())$$,
  '42501', null, 'anon ne peut pas se déclarer admin');

-- Ce qu'il peut lire : seulement le public.
select results_eq(
  'select name from public.services order by name',
  $$values ('Coupe'::text)$$,
  'anon ne voit que les prestations actives');
select results_eq(
  'select image_path from public.gallery_items order by image_path',
  $$values ('a1000000-0000-4000-8000-000000000001.webp'::text)$$,
  'anon ne voit que les photos publiées');
-- Colonnes internes de services : illisibles (droit par colonne), même pour filtrer.
select throws_ok('select created_at from public.services', '42501', null,
  'anon ne peut pas lire services.created_at');
select throws_ok('select id from public.services where not active', '42501', null,
  'anon ne peut pas lire ni filtrer sur services.active');

select * from finish();
rollback;
