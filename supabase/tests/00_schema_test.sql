-- Structure et droits globaux : tables, RLS partout, contraintes, ce que l'anon peut toucher.
begin;
create extension if not exists pgtap with schema extensions;
-- Les migrations retirent l'EXECUTE implicite sur les fonctions : on le rend aux rôles de l'API
-- pour les seules fonctions de pgTAP, le temps du test (annulé par le rollback).
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

select plan(18);

-- Les six tables existent.
select has_table('public', 'services', 'table services');
select has_table('public', 'locations', 'table locations');
select has_table('public', 'availabilities', 'table availabilities');
select has_table('public', 'bookings', 'table bookings');
select has_table('public', 'gallery_items', 'table gallery_items');
select has_table('public', 'admins', 'table admins');

-- RLS activé sur TOUTES les tables du schéma public, sans exception.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint,
  'RLS activé sur toutes les tables de public'
);

-- Contraintes clés.
select ok(
  exists (select 1 from pg_constraint where conname = 'bookings_no_overlap' and contype = 'x'),
  'contrainte d''exclusion anti-double-réservation'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'availabilities_no_overlap' and contype = 'x'),
  'contrainte d''exclusion anti-chevauchement des dispos'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'bookings_contact_required' and contype = 'c'),
  'au moins un moyen de contact obligatoire'
);

-- Les quatre RPC publiques : security definer et search_path vide.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_available_slots', 'create_booking', 'get_booking', 'cancel_booking')
      and p.prosecdef
      and p.proconfig @> array['search_path=""']),
  4::bigint,
  'les 4 RPC sont security definer avec search_path vide'
);

-- anon n'exécute QUE ces quatre fonctions (public et private confondus).
select set_eq(
  $$select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and has_function_privilege('anon', p.oid, 'execute')$$,
  array['get_available_slots', 'create_booking', 'get_booking', 'cancel_booking'],
  'anon n''exécute que les 4 RPC publiques'
);

-- anon ne lit aucune table en entier (consigne 20 : gallery_items passe aux colonnes)...
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'),
  0::bigint,
  'anon ne lit aucune table en entier'
);

-- ... seulement, colonne par colonne, ce que le site affiche (prestations et galerie).
select set_eq(
  $$select table_name::text || '.' || column_name::text from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'$$,
  array['services.id', 'services.name', 'services.duration_min', 'services.price_label',
        'services.sort_order', 'gallery_items.id', 'gallery_items.image_path',
        'gallery_items.alt_text', 'gallery_items.width', 'gallery_items.height',
        'gallery_items.sort_order'],
  'anon ne lit que les colonnes d''affichage de services et de gallery_items'
);

-- ... et n'écrit nulle part (ni table entière, ni colonne).
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'),
  0::bigint,
  'anon n''a aucun droit d''écriture sur les tables'
);
select is(
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'),
  0::bigint,
  'anon n''a aucun droit d''écriture sur une colonne'
);

-- Aucune adresse stockée (ADR 0008, consigne 24) : détail dans 23_lieux_sans_adresse_test.sql.
select hasnt_column('public', 'locations', 'private_address',
  'locations : aucune colonne d''adresse');

-- La table admins n'est écrite par personne via l'API.
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'admins'
      and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
  0::bigint,
  'admins : aucune écriture possible via l''API'
);

select * from finish();
rollback;
