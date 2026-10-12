-- Plages de disponibilité côté admin (consigne 18) : droits des 3 profils, validation à date
-- fixe, chevauchement, lieu inactif, suppression avec réservations, lecture des lieux limitée
-- à id, public_label, active.
-- « Maintenant » est FIXE pour les règles de date : private.admin_create_availability_at reçoit
-- lundi 4 mars 2030, 9 h à Paris. Les appels aux vraies fonctions (avec now()) utilisent des
-- plages en 2099 (toujours futures) ou en 2001 (toujours passées) : rien ne dépend du jour.
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

select plan(62);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants FICTIFS (jamais un vrai uuid, un vrai e-mail ni une vraie adresse).
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 70, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true),
  ('20000000-0000-4000-8000-000000000002', 'Ville deux', false);

-- Plages posées en tant que postgres.
insert into public.availabilities (id, location_id, starts_at, ends_at) values
  -- Passée, avec un RDV passé confirmé.
  ('50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2001-05-02 10:00 Europe/Paris', '2001-05-02 13:30 Europe/Paris'),
  -- Future, avec un RDV futur confirmé.
  ('50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001',
   '2099-06-10 10:00 Europe/Paris', '2099-06-10 13:30 Europe/Paris'),
  -- Future, avec un RDV annulé seulement.
  ('50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   '2099-06-11 10:00 Europe/Paris', '2099-06-11 13:30 Europe/Paris'),
  -- Future, vide.
  ('50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001',
   '2099-06-12 14:00 Europe/Paris', '2099-06-12 18:00 Europe/Paris'),
  -- Mercredi 6 mars 2030, 10 h – 12 h : sert aux chevauchements à date fixe.
  ('50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
   '2030-03-06 10:00 Europe/Paris', '2030-03-06 12:00 Europe/Paris');

insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone, status, cancelled_by)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2001-05-02 10:00 Europe/Paris', now(), 'Eva', 'Petit', '0700000001', 'confirmed', null),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2099-06-10 11:10 Europe/Paris', now(), 'Tom', 'Durand', '0700000002', 'confirmed', null),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2099-06-11 10:00 Europe/Paris', now(), 'Lou', 'Martin', '0700000003', 'cancelled', 'client');

-- Raccourci : création à date fixe (lundi 4 mars 2030, 9 h, Paris), lieu actif par défaut.
create function pg_temp.create_at(
  p_starts text,
  p_ends text,
  p_location uuid default '20000000-0000-4000-8000-000000000001'
) returns table (id uuid, location_id uuid, location_label text, starts_at timestamptz,
                  ends_at timestamptz, slot_count integer, booking_count integer)
language sql as $$
  select * from private.admin_create_availability_at(
    '2030-03-04 09:00 Europe/Paris', p_location, p_starts::timestamptz, p_ends::timestamptz);
$$;

-- ---------------------------------------------------------------------------
-- 1. Droits d'exécution : authenticated seulement, jamais anon ni les fonctions internes.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.admin_booking_rules()', 'execute'),
  'anon : admin_booking_rules non exécutable');
select ok(not has_function_privilege('anon', 'public.admin_list_availabilities()', 'execute'),
  'anon : admin_list_availabilities non exécutable');
select ok(not has_function_privilege('anon',
  'public.admin_create_availability(uuid, timestamptz, timestamptz)', 'execute'),
  'anon : admin_create_availability non exécutable');
select ok(not has_function_privilege('anon', 'public.admin_delete_availability(uuid)', 'execute'),
  'anon : admin_delete_availability non exécutable');
select ok(not has_function_privilege('authenticated',
  'private.admin_create_availability_at(timestamptz, uuid, timestamptz, timestamptz)', 'execute'),
  'authenticated : la version à date injectable n''est pas exécutable');
select ok(not has_function_privilege('authenticated', 'private.require_admin()', 'execute'),
  'authenticated : private.require_admin non exécutable');
select ok(not has_function_privilege('authenticated',
  'private.availability_booking_count(uuid, timestamptz, timestamptz)', 'execute'),
  'authenticated : private.availability_booking_count non exécutable');
select ok(not has_function_privilege('authenticated',
  'private.availability_slot_count(timestamptz, timestamptz)', 'execute'),
  'authenticated : private.availability_slot_count non exécutable');
select is(
  (select count(*) from unnest(array[
      'private.require_admin()',
      'private.availability_slot_count(timestamptz, timestamptz)',
      'private.availability_booking_count(uuid, timestamptz, timestamptz)',
      'private.admin_create_availability_at(timestamptz, uuid, timestamptz, timestamptz)'
    ]) f where has_function_privilege('anon', f, 'execute')),
  0::bigint, 'anon : aucune fonction interne des disponibilités exécutable');
-- Création, suppression de plage et réservation prennent le MÊME verrou global : une plage ne
-- disparaît jamais entre la vérification d'un créneau et l'insertion d'un RDV.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('private', 'create_booking_at'),
                                     ('private', 'admin_create_availability_at'),
                                     ('public', 'admin_delete_availability'))
      and p.prosrc like '%hashtextextended(''booking:slots'', 0)%'),
  3::bigint, 'create_booking_at, création et suppression de plage partagent le verrou booking:slots');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%' and not p.prosecdef),
  0::bigint, 'les 4 fonctions admin sont security definer');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
      and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))),
  0::bigint, 'les 4 fonctions admin fixent search_path à vide');

-- ---------------------------------------------------------------------------
-- 2. Visiteur (anon).
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.admin_list_availabilities()', '42501', null,
  'anon : ne liste pas les plages');
select throws_ok($$select * from public.admin_create_availability(
    '20000000-0000-4000-8000-000000000001', '2099-07-01 10:00+00', '2099-07-01 12:00+00')$$,
  '42501', null, 'anon : ne crée pas de plage');
select throws_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'anon : ne supprime pas de plage');
select throws_ok('select id, public_label from public.locations', '42501', null,
  'anon : ne lit pas les lieux');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Connecté SANS ligne dans admins : « forbidden » partout.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select throws_ok('select * from public.admin_booking_rules()', '42501', 'forbidden',
  'non-admin : ne lit pas les règles');
select throws_ok('select * from public.admin_list_availabilities()', '42501', 'forbidden',
  'non-admin : ne liste pas les plages');
select throws_ok($$select * from public.admin_create_availability(
    '20000000-0000-4000-8000-000000000001', '2099-07-01 10:00+00', '2099-07-01 12:00+00')$$,
  '42501', 'forbidden', 'non-admin : ne crée pas de plage');
select throws_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000004')$$,
  '42501', 'forbidden', 'non-admin : ne supprime pas de plage');
select is((select count(*) from public.locations), 0::bigint,
  'non-admin : ne voit aucun lieu');
reset role;
select is((select count(*) from public.availabilities), 5::bigint,
  'après les tentatives anon et non-admin : aucune plage créée ni supprimée');

-- ---------------------------------------------------------------------------
-- 4. Admin : lieux réduits à id, public_label, active ; aucune écriture directe.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select results_eq(
  'select id, public_label, active from public.locations order by public_label',
  $$values ('20000000-0000-4000-8000-000000000002'::uuid, 'Ville deux'::text, false),
           ('20000000-0000-4000-8000-000000000001'::uuid, 'Ville un'::text, true)$$,
  'admin : lit id, public_label et active de tous les lieux');
select throws_ok('select * from public.locations', '42501', null,
  'admin : select * sur locations refusé (il inclurait sort_order et created_at)');
select throws_ok('select sort_order from public.locations', '42501', null,
  'admin : ne lit aucune autre colonne que id, public_label, active');
select throws_ok($$update public.locations set active = true$$, '42501', null,
  'admin : n''active pas un lieu');
select throws_ok($$delete from public.locations$$, '42501', null,
  'admin : ne supprime pas de lieu');
select throws_ok($$insert into public.availabilities (location_id, starts_at, ends_at)
    values ('20000000-0000-4000-8000-000000000001', '2099-07-01 10:00+00', '2099-07-01 12:00+00')$$,
  '42501', null, 'admin : pas d''insertion directe de plage (contournerait la validation)');
select throws_ok($$update public.availabilities set ends_at = ends_at + interval '1 hour'$$,
  '42501', null, 'admin : pas de modification directe de plage');
select throws_ok($$delete from public.availabilities$$, '42501', null,
  'admin : pas de suppression directe de plage');

-- Règles : lues dans private.settings().
select results_eq('select * from public.admin_booking_rules()',
  $$values (70, 120, 28)$$, 'admin : règles 70 min / 2 h / 28 jours');
-- Comparaison faite en postgres (seul à lire private.settings()), avec l'identité de l'admin
-- toujours dans les claims (exigée par admin_booking_rules).
reset role;
select ok(
  (select make_interval(days => r.max_advance_days) = (select max_advance from private.settings())
     and make_interval(mins => r.slot_step_min) = (select slot_step from private.settings())
     and make_interval(mins => r.min_notice_min) = (select min_notice from private.settings())
     from public.admin_booking_rules() r),
  'admin_booking_rules rend exactement private.settings() (horizon en jours seuls)');
set local role authenticated;

-- Liste : plages non terminées seulement, comptes, aucun champ d'adresse.
select results_eq(
  -- Filtre sur 2099 : la plage de mars 2030 (…005) sortira de la liste après sa fin, le test
  -- ne doit pas casser ce jour-là.
  $$select id, location_label, slot_count, booking_count from public.admin_list_availabilities()
     where starts_at > '2050-01-01'$$,
  $$values ('50000000-0000-4000-8000-000000000002'::uuid, 'Ville un'::text, 3, 1),
           ('50000000-0000-4000-8000-000000000003'::uuid, 'Ville un'::text, 3, 0),
           ('50000000-0000-4000-8000-000000000004'::uuid, 'Ville un'::text, 3, 0)$$,
  'admin : liste chronologique, sans la plage passée, créneaux de 70 min et RDV confirmés');
select is(
  (select count(*) from public.admin_list_availabilities() r where r::text ilike '%secrète%'),
  0::bigint, 'admin : la liste ne contient jamais l''adresse privée');

-- Création via la vraie fonction (plage en 2099).
select results_eq(
  $$select location_label, slot_count, booking_count from public.admin_create_availability(
      '20000000-0000-4000-8000-000000000001',
      '2099-07-01 10:00 Europe/Paris', '2099-07-01 13:30 Europe/Paris')$$,
  $$values ('Ville un'::text, 3, 0)$$,
  'admin : crée une plage, 3 créneaux (10:00, 11:10, 12:20)');
select is(
  (select count(*) from public.admin_create_availability(
      '20000000-0000-4000-8000-000000000001',
      '2099-07-02 10:00 Europe/Paris', '2099-07-02 12:00 Europe/Paris') r
    where r::text ilike '%secrète%'),
  0::bigint, 'admin : le résultat de la création ne contient pas l''adresse privée');
select throws_ok($$select * from public.admin_create_availability(
    '20000000-0000-4000-8000-000000000001',
    '2099-07-01 12:00 Europe/Paris', '2099-07-01 14:00 Europe/Paris')$$,
  'P0001', 'availability_overlap', 'admin : chevauchement refusé avec un code lisible');
select throws_ok($$select * from public.admin_create_availability(
    '20000000-0000-4000-8000-000000000001',
    '2001-07-01 10:00 Europe/Paris', '2001-07-01 12:00 Europe/Paris')$$,
  'P0001', 'in_past', 'admin : la vraie fonction refuse une plage passée (now())');

-- Suppression.
select throws_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000002')$$,
  'P0001', 'availability_has_bookings', 'admin : suppression refusée, RDV futur confirmé');
select throws_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000001')$$,
  'P0001', 'availability_has_bookings',
  'admin : suppression refusée aussi avec un RDV passé (aucun RDV hors plage en silence)');
select lives_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000003')$$,
  'admin : supprime une plage qui n''a qu''un RDV annulé');
select lives_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000004')$$,
  'admin : supprime une plage vide');
select throws_ok($$select public.admin_delete_availability('50000000-0000-4000-8000-000000000004')$$,
  'P0001', 'not_found', 'admin : plage déjà supprimée → not_found');
select throws_ok('select public.admin_delete_availability(null)',
  'P0001', 'invalid_input', 'admin : identifiant nul → invalid_input');
reset role;

select is((select count(*) from public.bookings), 3::bigint,
  'aucune réservation supprimée par les suppressions de plages');
select is(
  (select count(*) from public.availabilities
    where id in ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')),
  2::bigint, 'les plages avec réservations sont toujours là');

-- ---------------------------------------------------------------------------
-- 5. Validation à date fixe (maintenant = lundi 4 mars 2030, 9 h, Paris).
-- ---------------------------------------------------------------------------
select throws_ok($$select * from pg_temp.create_at('2030-03-04 08:00 Europe/Paris', '2030-03-04 10:00 Europe/Paris')$$,
  'P0001', 'in_past', 'plage commencée avant maintenant → in_past');
select throws_ok($$select * from pg_temp.create_at('2030-03-04 09:00 Europe/Paris', '2030-03-04 11:00 Europe/Paris')$$,
  'P0001', 'in_past', 'plage qui commence pile maintenant → in_past');
select lives_ok($$select * from pg_temp.create_at('2030-03-04 09:01 Europe/Paris', '2030-03-04 10:11 Europe/Paris')$$,
  'plage qui commence une minute après maintenant : acceptée');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 12:00 Europe/Paris', '2030-03-05 12:00 Europe/Paris')$$,
  'P0001', 'invalid_range', 'fin = début → invalid_range');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 12:00 Europe/Paris', '2030-03-05 10:00 Europe/Paris')$$,
  'P0001', 'invalid_range', 'fin avant début → invalid_range');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 10:00 Europe/Paris', '2030-03-06 10:01 Europe/Paris')$$,
  'P0001', 'invalid_range', 'plus de 24 h → invalid_range');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 10:00 Europe/Paris', '2030-03-05 11:09 Europe/Paris')$$,
  'P0001', 'too_short', '69 min : moins d''un créneau → too_short');
select results_eq($$select slot_count from pg_temp.create_at('2030-03-05 10:00 Europe/Paris', '2030-03-05 11:10 Europe/Paris')$$,
  $$values (1)$$, '70 min pile : acceptée, 1 créneau');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 14:00 Europe/Paris', '2030-03-05 16:00 Europe/Paris',
      '20000000-0000-4000-8000-000000000002')$$,
  'P0001', 'location_inactive', 'lieu inactif → location_inactive');
select throws_ok($$select * from pg_temp.create_at('2030-03-05 14:00 Europe/Paris', '2030-03-05 16:00 Europe/Paris',
      '20000000-0000-4000-8000-0000000000ff')$$,
  'P0001', 'location_inactive', 'lieu inconnu → même code que inactif');
select throws_ok($$select * from pg_temp.create_at(null, '2030-03-05 16:00 Europe/Paris')$$,
  'P0001', 'invalid_input', 'début nul → invalid_input');

-- Chevauchements avec la plage du mercredi 6 mars, 10 h – 12 h (tous lieux confondus).
select throws_ok($$select * from pg_temp.create_at('2030-03-06 11:00 Europe/Paris', '2030-03-06 13:00 Europe/Paris')$$,
  'P0001', 'availability_overlap', 'chevauchement partiel → availability_overlap');
select throws_ok($$select * from pg_temp.create_at('2030-03-06 09:00 Europe/Paris', '2030-03-06 13:00 Europe/Paris')$$,
  'P0001', 'availability_overlap', 'plage qui en englobe une autre → availability_overlap');
select lives_ok($$select * from pg_temp.create_at('2030-03-06 12:00 Europe/Paris', '2030-03-06 14:00 Europe/Paris')$$,
  'plage qui touche la précédente (12 h pile) : acceptée');
select lives_ok($$select * from pg_temp.create_at('2030-03-06 08:00 Europe/Paris', '2030-03-06 10:00 Europe/Paris')$$,
  'plage qui finit pile au début d''une autre : acceptée');

-- Changement d'heure : dim. 27 octobre 2030, 0 h – 5 h à Paris = 6 h réelles (3 h → 2 h).
select results_eq($$select slot_count from pg_temp.create_at('2030-10-27 00:00 Europe/Paris', '2030-10-27 05:00 Europe/Paris')$$,
  $$values (5)$$, 'nuit du passage à l''heure d''hiver : 6 h réelles → 5 créneaux de 70 min');

select * from finish();
rollback;
