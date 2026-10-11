-- Bucket « gallery » : privé (consigne 20), ni listage ni écriture hors admin. Détail : 15.
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

select plan(10);

-- Simule l'API Storage, seule autorisée à supprimer (trigger storage.protect_delete).
set local storage.allow_delete_query = 'true';

truncate public.admins;
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into storage.objects (bucket_id, name) values ('gallery', 'a7000000-0000-4000-8000-000000000001.webp');

select ok(
  exists (select 1 from storage.buckets where id = 'gallery' and not public),
  'le bucket gallery existe et est privé (URL signées, consigne 20)');
select ok(
  exists (select 1 from storage.buckets where id = 'gallery'
            and file_size_limit = 2097152
            and allowed_mime_types = array['image/webp', 'image/jpeg']),
  'le bucket gallery limite la taille (2 Mo) et le type (webp, jpeg)');

-- ---------------------------------------------------------------------------
-- Anonyme
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'pirate.jpg')$$,
  '42501', null, 'anon ne peut pas déposer de fichier');
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 0::bigint,
  'anon ne peut pas lister le contenu du bucket');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' returning 1) select count(*) from d$$,
  $$values (0::bigint)$$,
  'anon ne peut supprimer aucun fichier');

-- ---------------------------------------------------------------------------
-- Connecté, non admin
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'pirate.jpg')$$,
  '42501', null, 'non-admin connecté : ne peut pas déposer de fichier');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' returning 1) select count(*) from d$$,
  $$values (0::bigint)$$,
  'non-admin connecté : ne peut supprimer aucun fichier');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'a7000000-0000-4000-8000-000000000002.jpg')$$,
  'admin : dépose un fichier');
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 2::bigint,
  'admin : liste les fichiers du bucket');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' and name = 'a7000000-0000-4000-8000-000000000001.webp' returning 1)
    select count(*) from d$$,
  $$values (1::bigint)$$,
  'admin : supprime un fichier');

select * from finish();
rollback;
