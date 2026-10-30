-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : matrice COMPLÈTE des droits réels de anon et
-- authenticated sur les schémas public et private, comparée à la matrice attendue.
-- Différence avec 00 à 16 : ces tests-là vérifient des droits un par un ; ici, toute table,
-- colonne ou fonction AJOUTÉE sans être prévue fait échouer le test (liste fermée).
-- Pour mettre à jour : relancer la requête de la section concernée et recopier le résultat,
-- après avoir vérifié que le nouveau droit est voulu.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- ---------------------------------------------------------------------------
-- 1. Tables et vues : droits au niveau TABLE (S I U D T R Tg). Une ligne par (objet, rôle) ayant
--    au moins un droit. Seul authenticated a des droits de table, filtrés par RLS (is_admin()).
-- ---------------------------------------------------------------------------
select results_eq(
  $$
  select (n.nspname || '.' || c.relname) collate "default", r.rolname,
         concat_ws(',',
           case when has_table_privilege(r.rolname, c.oid, 'SELECT') then 'S' end,
           case when has_table_privilege(r.rolname, c.oid, 'INSERT') then 'I' end,
           case when has_table_privilege(r.rolname, c.oid, 'UPDATE') then 'U' end,
           case when has_table_privilege(r.rolname, c.oid, 'DELETE') then 'D' end,
           case when has_table_privilege(r.rolname, c.oid, 'TRUNCATE') then 'T' end,
           case when has_table_privilege(r.rolname, c.oid, 'REFERENCES') then 'R' end,
           case when has_table_privilege(r.rolname, c.oid, 'TRIGGER') then 'Tg' end)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm', 'S', 'p', 'f')
     and (has_table_privilege(r.rolname, c.oid, 'SELECT')
          or has_table_privilege(r.rolname, c.oid, 'INSERT')
          or has_table_privilege(r.rolname, c.oid, 'UPDATE')
          or has_table_privilege(r.rolname, c.oid, 'DELETE')
          or has_table_privilege(r.rolname, c.oid, 'TRUNCATE')
          or has_table_privilege(r.rolname, c.oid, 'REFERENCES')
          or has_table_privilege(r.rolname, c.oid, 'TRIGGER'))
   order by 1, 2
  $$,
  $$ values
    ('public.admins', 'authenticated', 'S'),
    ('public.availabilities', 'authenticated', 'S'),
    ('public.services', 'authenticated', 'S,I,U,D')
  $$,
  'droits de TABLE : exactement la liste prévue (aucun TRUNCATE, REFERENCES ni TRIGGER)');

-- ---------------------------------------------------------------------------
-- 2. Droits au niveau COLONNE (s = select, i = insert, u = update), rôle par rôle.
--    anon : seulement les colonnes d'affichage de services et gallery_items.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
  select (n.nspname || '.' || c.relname) collate "default", r.rolname,
         string_agg(a.attname || ':' || concat_ws('',
           case when has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT') then 's' end,
           case when has_column_privilege(r.rolname, c.oid, a.attnum, 'INSERT') then 'i' end,
           case when has_column_privilege(r.rolname, c.oid, a.attnum, 'UPDATE') then 'u' end),
           ' ' order by a.attnum) collate "default"
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'v', 'm', 'p', 'f')
     and (has_column_privilege(r.rolname, c.oid, a.attnum, 'SELECT')
          or has_column_privilege(r.rolname, c.oid, a.attnum, 'INSERT')
          or has_column_privilege(r.rolname, c.oid, a.attnum, 'UPDATE'))
   group by 1, 2
   order by 1, 2
  $$,
  $$ values
    ('public.admins', 'authenticated', 'user_id:s created_at:s'),
    ('public.availabilities', 'authenticated', 'id:s location_id:s starts_at:s ends_at:s created_at:s'),
    ('public.gallery_items', 'anon', 'id:s image_path:s sort_order:s alt_text:s width:s height:s'),
    ('public.locations', 'authenticated', 'id:s public_label:s active:s'),
    ('public.services', 'anon', 'id:s name:s duration_min:s price_label:s sort_order:s'),
    ('public.services', 'authenticated',
     'id:siu name:siu duration_min:siu price_label:siu active:siu sort_order:siu created_at:siu')
  $$,
  'droits de COLONNE : jamais phone, email, cancel_token ni consent_at');

-- ---------------------------------------------------------------------------
-- 3. Schémas : anon n'a pas USAGE sur private ; authenticated l'a (les policies Storage
--    appellent private.is_admin(), private.is_gallery_path()…), sans droit sur ses tables.
-- ---------------------------------------------------------------------------
select results_eq(
  $$
  select n.nspname::text collate "default", r.rolname, has_schema_privilege(r.rolname, n.oid, 'USAGE')
    from pg_namespace n cross join (values ('anon'), ('authenticated')) r(rolname)
   where n.nspname in ('public', 'private')
   order by 1, 2
  $$,
  $$ values ('private', 'anon', false), ('private', 'authenticated', true),
            ('public', 'anon', true), ('public', 'authenticated', true) $$,
  'USAGE des schémas : private fermé à anon');

-- ---------------------------------------------------------------------------
-- 4. Fonctions exécutables (hors fonctions d'extensions) : (nom, anon, authenticated).
--    PUBLIC n'exécute rien ; les 5 RPC publiques sont à anon SEULEMENT ; les RPC admin_* à
--    authenticated SEULEMENT (puis require_admin() dans la fonction).
-- ---------------------------------------------------------------------------
select results_eq(
  $$
  select (n.nspname || '.' || p.proname) collate "default",
         has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
   order by 1
  $$,
  $$ values
    ('private.gallery_bucket_has_room', false, true),
    ('private.is_admin', false, true),
    ('private.is_gallery_path', false, true),
    ('private.is_safe_text', false, true),
    ('public.admin_add_gallery_item', false, true),
    ('public.admin_booking_rules', false, true),
    ('public.admin_cancel_booking', false, true),
    ('public.admin_create_availability', false, true),
    ('public.admin_delete_availability', false, true),
    ('public.admin_delete_gallery_item', false, true),
    ('public.admin_delete_push_subscription', false, true),
    ('public.admin_gallery_orphans', false, true),
    ('public.admin_get_booking', false, true),
    ('public.admin_hide_gallery_item', false, true),
    ('public.admin_list_availabilities', false, true),
    ('public.admin_list_bookings', false, true),
    ('public.admin_list_gallery_items', false, true),
    ('public.admin_move_gallery_item', false, true),
    ('public.admin_save_push_subscription', false, true),
    ('public.admin_send_test_push', false, true),
    ('public.admin_set_gallery_item_published', false, true),
    ('public.admin_update_gallery_item_alt', false, true),
    ('public.cancel_booking', true, false),
    ('public.create_booking', true, false),
    ('public.get_available_days', true, false),
    ('public.get_available_slots', true, false),
    ('public.get_booking', true, false)
  $$,
  'EXECUTE : exactement la liste prévue, rien pour PUBLIC');

-- ---------------------------------------------------------------------------
-- 5. Toute fonction SECURITY DEFINER de nos schémas fixe son search_path (sinon un objet
--    homonyme créé ailleurs pourrait être appelé avec les droits du propriétaire).
-- ---------------------------------------------------------------------------
select is_empty(
  $$
  select n.nspname || '.' || p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  $$,
  'toute fonction security definer a un search_path fixé');

select * from finish();
rollback;
