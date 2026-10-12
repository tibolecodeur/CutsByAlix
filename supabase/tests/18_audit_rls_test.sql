-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : RLS partout, et balayage SYSTÉMATIQUE des
-- accès directs et des fonctions admin par anon et par un connecté non admin.
-- Les tests 01, 02 et 12 vérifient des cas choisis ; ici, chaque table et chaque fonction
-- admin_* est essayée automatiquement : une table ou une RPC ajoutée plus tard est couverte
-- sans rien écrire de plus.
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

select plan(12);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants FICTIFS.
insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('31000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('31000000-0000-4000-8000-000000000001');
insert into public.services (id, name, duration_min, active) values
  ('11000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, private_address, active) values
  ('21000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse factice', true);
insert into public.availabilities (id, location_id, starts_at, ends_at) values
  ('41000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001',
   '2030-06-12 10:00 Europe/Paris', '2030-06-12 12:00 Europe/Paris');
insert into public.bookings (id, service_id, location_id, starts_at, first_name, last_name, phone)
values ('51000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001',
        '21000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris',
        'Léa', 'Martin', '0612345678');
insert into public.gallery_items (id, image_path, alt_text, width, height, published, consent_at) values
  ('61000000-0000-4000-8000-000000000001', 'a1800000-0000-4000-8000-000000000001.webp',
   'Publiée', 800, 600, true, now());

-- Exécute une requête et renvoie son SQLSTATE ('00000' si elle passe), sans interrompre le test.
create function pg_temp.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '00000';
exception when others then
  return sqlstate;
end $$;
grant execute on function pg_temp.sqlstate_of(text) to anon, authenticated;

-- Pour chaque table privée, les 4 écritures/lectures directes possibles.
create function pg_temp.direct_access_sql() returns table (label text, sql text)
language sql as $$
  select t || ' ' || op,
         case op
           when 'select' then format('select * from public.%I', t)
           when 'insert' then format('insert into public.%I default values', t)
           when 'update' then format('update public.%I set created_at = created_at', t)
           when 'delete' then format('delete from public.%I', t)
         end
    from unnest(array['bookings', 'admins', 'availabilities', 'gallery_items', 'locations']) t
   cross join unnest(array['select', 'insert', 'update', 'delete']) op;
$$;
grant execute on function pg_temp.direct_access_sql() to anon, authenticated;

-- Lignes encore présentes, mesurées en postgres (une écriture « réussie » sans effet compte
-- comme un échec de l'attaquant ; on vérifie surtout qu'aucune ligne n'a bougé).
create function pg_temp.fingerprint() returns text
language sql security definer as $$
  select md5(concat_ws('|',
    (select string_agg(b::text, ',' order by b.id) from public.bookings b),
    (select string_agg(a::text, ',' order by a.user_id) from public.admins a),
    (select string_agg(a::text, ',' order by a.id) from public.availabilities a),
    (select string_agg(g::text, ',' order by g.id) from public.gallery_items g),
    (select string_agg(l::text, ',' order by l.id) from public.locations l)));
$$;
select pg_temp.fingerprint() as before \gset

-- Chaque fonction admin_* de public, appelée avec des NULL (arguments typés).
create function pg_temp.admin_rpc_sql() returns table (label text, sql text)
language sql as $$
  select p.proname,
         format('select * from public.%I(%s)', p.proname,
           coalesce((select string_agg(format('null::%s', format_type(t, null)), ', ' order by o)
                       from unnest(p.proargtypes) with ordinality as a(t, o)), ''))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'admin\_%';
$$;
grant execute on function pg_temp.admin_rpc_sql() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. RLS : activée sur TOUTES les tables de public et private, et au moins une policy (ou
--    aucune ligne lisible) : aucune table « ouverte » par oubli.
-- ---------------------------------------------------------------------------
select is_empty(
  $$select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'RLS activée sur toutes les tables de public et private');
select is_empty(
  $$select n.nspname || '.' || c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and not exists (select 1 from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname)$$,
  'aucune table de public sans policy');
select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'$$,
  'aucune vue dans public (une vue contournerait la RLS de ses tables sources)');
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), true,
  'RLS activée sur storage.objects');

-- ---------------------------------------------------------------------------
-- 2. anon : toute lecture et écriture directe sur les 5 tables privées est REFUSÉE (42501),
--    à une exception prévue : la lecture des photos publiées (colonnes d'affichage).
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  (select string_agg(label || '=' || st, ', ' order by label) from (
     select label, pg_temp.sqlstate_of(sql) st from pg_temp.direct_access_sql()) x
    where st <> '42501'),
  null,
  'anon : 20 accès directs essayés, tous refusés (select * de gallery_items compris : colonnes privées)');
select is(
  (select string_agg(label, ', ' order by label) from (
     select label, pg_temp.sqlstate_of(sql) st from pg_temp.admin_rpc_sql()) x
    where st <> '42501'),
  null,
  'anon : toutes les fonctions admin_* refusées (42501)');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Connecté NON admin (compte qui n'aurait jamais dû exister) : rien ne passe.
--    Lecture : 42501 ou 0 ligne (RLS) ; écriture : 42501 ou 0 ligne ; jamais de donnée.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "31000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select is(
  (select string_agg(label || '=' || st, ', ' order by label) from (
     select label, pg_temp.sqlstate_of(sql) st from pg_temp.direct_access_sql()) x
    where st not in ('42501')),
  'admins select=00000, availabilities select=00000'::text,
  'non-admin : seules les lectures prévues passent (filtrées par RLS, voir le test suivant)');
select is(
  (select count(*) from public.admins) + (select count(*) from public.availabilities)
    + (select count(id) from public.locations),
  0::bigint,
  'non-admin : ces lectures ne renvoient AUCUNE ligne');
select is(
  (select string_agg(label || '=' || st, ', ' order by label) from (
     select label, pg_temp.sqlstate_of(sql) st from pg_temp.admin_rpc_sql()) x
    where st <> '42501'),
  null,
  'non-admin : toutes les fonctions admin_* refusées (42501 « forbidden »), avant même de lire les arguments');
-- Même chose avec de VRAIS identifiants (pas seulement des NULL).
select is(
  concat_ws(',',
    pg_temp.sqlstate_of($$select * from public.admin_get_booking('51000000-0000-4000-8000-000000000001')$$),
    pg_temp.sqlstate_of($$select * from public.admin_cancel_booking('51000000-0000-4000-8000-000000000001')$$),
    pg_temp.sqlstate_of($$select * from public.admin_delete_availability('41000000-0000-4000-8000-000000000001')$$),
    pg_temp.sqlstate_of($$select * from public.admin_delete_gallery_item('61000000-0000-4000-8000-000000000001')$$)),
  '42501,42501,42501,42501',
  'non-admin : refus aussi avec des identifiants existants');
reset role;

-- Un jeton « authenticated » SANS sub (jeton fabriqué ou mal formé) : pas admin non plus.
set local role authenticated;
set local request.jwt.claims = '{"role": "authenticated"}';
select is(
  (select string_agg(label, ', ' order by label) from (
     select label, pg_temp.sqlstate_of(sql) st from pg_temp.admin_rpc_sql()) x
    where st <> '42501'),
  null,
  'connecté sans sub : toutes les fonctions admin_* refusées');
reset role;

select is(pg_temp.fingerprint(), :'before', 'aucune ligne modifiée par tous ces essais');

select * from finish();
rollback;
