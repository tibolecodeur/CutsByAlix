-- Admin vs simple utilisateur connecté : être connecté ne suffit pas, il faut être dans admins.
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

select plan(22);

-- ---------------------------------------------------------------------------
-- Droits sur le schéma private : nécessaires aux policies, et rien de plus.
-- ---------------------------------------------------------------------------
select ok(has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated a USAGE sur private (sinon les policies admin échouent)');
select ok(has_function_privilege('authenticated', 'private.is_admin()', 'execute'),
  'authenticated peut exécuter private.is_admin()');
select ok(not has_function_privilege('authenticated',
            'private.compute_slots(uuid, date, timestamptz)', 'execute'),
  'authenticated ne peut pas exécuter private.compute_slots');
select ok(not has_function_privilege('authenticated', 'private.settings()', 'execute'),
  'authenticated ne peut pas exécuter private.settings');
select ok(not has_schema_privilege('anon', 'private', 'usage'),
  'anon n''a aucun accès au schéma private');

-- ---------------------------------------------------------------------------
-- Données de test.
-- ---------------------------------------------------------------------------
truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('10000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false);
insert into public.locations (id, public_label, private_address) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un', '1 rue Secrète, 00000 Testville');
insert into public.availabilities (location_id, starts_at, ends_at) values (
  '20000000-0000-4000-8000-000000000001',
  now() + interval '3 days', now() + interval '3 days 4 hours');
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        now() + interval '3 days', now() + interval '3 days 1 hour', 'Léa', 'Martin', '0612345678');

-- ---------------------------------------------------------------------------
-- Utilisateur connecté mais PAS admin.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select throws_ok('select count(*) from public.bookings', '42501', null,
  'non-admin connecté : aucun droit sur les réservations');
select is((select count(*) from public.locations), 0::bigint,
  'non-admin connecté : ne voit aucun lieu');
select is((select count(*) from public.availabilities), 0::bigint,
  'non-admin connecté : ne voit aucune dispo');
select is((select count(*) from public.admins), 0::bigint,
  'non-admin connecté : ne voit pas la liste des admins');
select is((select count(*) from public.services where not active), 0::bigint,
  'non-admin connecté : ne voit pas les prestations inactives');
select throws_ok(
  $$insert into public.locations (public_label, private_address) values ('Pirate', 'x')$$,
  '42501', null, 'non-admin connecté : ne peut pas créer de lieu');
select throws_ok(
  $$update public.bookings set first_name = 'Pirate'$$, '42501', null,
  'non-admin connecté : ne peut modifier aucune réservation');
select throws_ok(
  $$insert into public.gallery_items (image_path) values ('pirate.jpg')$$,
  '42501', null, 'non-admin connecté : ne peut pas ajouter de photo');

-- ---------------------------------------------------------------------------
-- Admin.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';

-- Depuis la consigne 19 : réservations lues et annulées par les fonctions admin seulement
-- (admin_list_bookings, admin_get_booking, admin_cancel_booking, testées dans 14).
select throws_ok('select count(*) from public.bookings', '42501', null,
  'admin : ne lit pas les réservations en direct');
-- Depuis la consigne 18 : l'admin lit id, public_label et active, jamais l'adresse privée.
select throws_ok('select private_address from public.locations', '42501', null,
  'admin : ne lit pas l''adresse privée');
select is((select count(*) from public.services), 2::bigint,
  'admin : voit aussi les prestations inactives');
select throws_ok(
  $$insert into public.locations (public_label, private_address) values ('Lieu deux', 'Ailleurs')$$,
  '42501', null, 'admin : ne crée pas de lieu via l''API (consigne 18)');
select throws_ok(
  $$update public.bookings set status = 'cancelled', cancelled_by = 'barber'$$, '42501', null,
  'admin : n''annule pas en direct (contournerait admin_cancel_booking)');
select lives_ok(
  $$insert into public.gallery_items (image_path, caption, published) values ('coupe.jpg', 'Dégradé', true)$$,
  'admin : ajoute une photo');
select is((select count(*) from public.admins), 1::bigint,
  'admin : lit la liste des admins');
select throws_ok(
  $$insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'admin : ne peut pas ajouter un admin via l''API');
select throws_ok(
  $$delete from public.admins$$,
  '42501', null, 'admin : ne peut pas retirer un admin via l''API');

select * from finish();
rollback;
