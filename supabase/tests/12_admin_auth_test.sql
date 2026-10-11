-- Espace admin (consigne 17) : être connecté ne donne AUCUN droit, seule une ligne dans admins
-- en donne. Trois profils : anon (visiteur), authenticated sans ligne dans admins (compte qui
-- n'aurait jamais dû exister : inscriptions fermées), admin. Aucune date dans ce test.
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

select plan(35);

-- Simule l'API Storage, seule autorisée à supprimer (trigger storage.protect_delete).
set local storage.allow_delete_query = 'true';

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants FICTIFS (jamais un vrai uuid ni un vrai e-mail).
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('10000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false);
insert into public.gallery_items (image_path, caption, published) values
  ('publiee.jpg', 'Publiée', true),
  ('masquee.jpg', 'Masquée', false);
insert into public.locations (id, public_label, private_address) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un', '1 rue Secrète, 00000 Testville');
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris', '2030-06-12 12:00 Europe/Paris');
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        '2030-06-12 10:00 Europe/Paris', '2030-06-12 11:00 Europe/Paris', 'Léa', 'Martin', '0612345678');
insert into storage.objects (bucket_id, name) values ('gallery', 'photo.jpg');

-- Raccourci : nombre de lignes visibles dans chacune des 6 tables, pour le rôle courant.
create function pg_temp.visible() returns text
language sql as $$
  select format('services=%s gallery_items=%s locations=%s availabilities=%s bookings=%s admins=%s',
    (select count(*) from public.services), (select count(*) from public.gallery_items),
    (select count(*) from public.locations), (select count(*) from public.availabilities),
    (select count(*) from public.bookings), (select count(*) from public.admins));
$$;
grant execute on function pg_temp.visible() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Visiteur (anon) : seulement le catalogue public.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select pg_temp.visible()', '42501', null,
  'anon : n''a aucun droit sur locations, availabilities, bookings ni admins');
select is((select count(*) from public.services), 1::bigint,
  'anon : lit les prestations actives seulement');
select is((select count(*) from public.gallery_items), 1::bigint,
  'anon : lit les photos publiées seulement');
select throws_ok('select count(*) from public.admins', '42501', null,
  'anon : ne peut pas lire admins');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Connecté SANS ligne dans admins : RIEN, nulle part.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(pg_temp.visible(),
  'services=0 gallery_items=0 locations=0 availabilities=0 bookings=0 admins=0',
  'non-admin connecté : 0 ligne sur les 6 tables (même le catalogue public)');
select is((select count(*) from public.admins where user_id = auth.uid()), 0::bigint,
  'non-admin connecté : sa propre ligne admins n''existe pas (le front le voit non-admin)');
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 0::bigint,
  'non-admin connecté : ne liste aucun objet du bucket gallery');
select is((select count(*) from storage.buckets), 0::bigint,
  'non-admin connecté : ne voit même pas la liste des buckets');
select ok(not has_function_privilege('authenticated', 'private.settings()', 'execute'),
  'non-admin connecté : ne lit pas les règles métier (private.settings)');

select throws_ok($$insert into public.services (name, duration_min) values ('Pirate', 60)$$,
  '42501', null, 'non-admin connecté : n''ajoute pas de prestation');
select throws_ok($$insert into public.gallery_items (image_path) values ('pirate.jpg')$$,
  '42501', null, 'non-admin connecté : n''ajoute pas de photo');
select throws_ok($$insert into public.locations (public_label, private_address) values ('P', 'x')$$,
  '42501', null, 'non-admin connecté : ne crée pas de lieu');
select throws_ok($$insert into public.availabilities (location_id, starts_at, ends_at)
    values ('20000000-0000-4000-8000-000000000001', '2030-07-01 10:00+00', '2030-07-01 11:00+00')$$,
  '42501', null, 'non-admin connecté : ne crée pas de dispo');
select throws_ok($$insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'non-admin connecté : ne peut pas se déclarer admin');
select results_eq(
  $$with u as (update public.bookings set first_name = 'Pirate' returning 1) select count(*) from u$$,
  $$values (0::bigint)$$, 'non-admin connecté : ne modifie aucune réservation');
select results_eq(
  $$with u as (update public.services set active = true returning 1) select count(*) from u$$,
  $$values (0::bigint)$$, 'non-admin connecté : ne modifie aucune prestation');
select results_eq(
  $$with d as (delete from public.gallery_items returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'non-admin connecté : ne supprime aucune photo');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('gallery', 'pirate.jpg')$$,
  '42501', null, 'non-admin connecté : ne dépose rien dans le bucket gallery');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'non-admin connecté : ne supprime rien dans le bucket gallery');

-- Les RPC publiques sont réservées à anon : un connecté ne peut pas les appeler.
select throws_ok($$select * from public.get_available_slots('10000000-0000-4000-8000-000000000001', '2030-06-12')$$,
  '42501', null, 'non-admin connecté : get_available_slots refusée');
select throws_ok($$select * from public.get_booking('40000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'non-admin connecté : get_booking refusée');
select throws_ok($$select public.cancel_booking('40000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'non-admin connecté : cancel_booking refusée');
select ok(not has_function_privilege('authenticated',
  'public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text)', 'execute'),
  'non-admin connecté : create_booking refusée');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Admin : tout, sauf l'écriture de admins via l'API et l'adresse privée des lieux.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(pg_temp.visible(),
  'services=2 gallery_items=2 locations=1 availabilities=1 bookings=1 admins=1',
  'admin : voit toutes les lignes des 6 tables (masquées comprises)');
select is((select count(*) from public.admins where user_id = auth.uid()), 1::bigint,
  'admin : lit SA ligne admins (c''est ainsi que le front le reconnaît)');
select throws_ok('select private_address from public.locations', '42501', null,
  'admin : ne lit pas l''adresse privée (consigne 18)');
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 1::bigint,
  'admin : liste les objets du bucket gallery');
select lives_ok($$insert into public.services (name, duration_min) values ('Barbe', 30)$$,
  'admin : ajoute une prestation');
select lives_ok($$update public.gallery_items set published = true$$,
  'admin : publie une photo');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('gallery', 'nouvelle.jpg')$$,
  'admin : dépose une photo dans le bucket');
select throws_ok($$insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'admin : ne peut pas ajouter un admin via l''API');
select throws_ok($$delete from public.admins$$,
  '42501', null, 'admin : ne peut pas retirer un admin via l''API');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Les policies de lecture publique ne visent plus que anon.
-- ---------------------------------------------------------------------------
select is(
  (select roles::text from pg_policies where tablename = 'services' and policyname = 'services_public_read'),
  '{anon}', 'services_public_read : anon seulement');
select is(
  (select roles::text from pg_policies where tablename = 'gallery_items' and policyname = 'gallery_items_public_read'),
  '{anon}', 'gallery_items_public_read : anon seulement');
select is(
  (select count(*) from pg_policies
    where schemaname in ('public', 'storage')
      and 'authenticated' = any (roles)
      and coalesce(qual, '') not like '%is_admin()%'
      and coalesce(with_check, '') not like '%is_admin()%'
      and (schemaname = 'public' or qual like '%gallery%' or with_check like '%gallery%')),
  0::bigint,
  'aucune policy pour authenticated sans condition is_admin() (tables publiques et bucket gallery)');

select * from finish();
rollback;
