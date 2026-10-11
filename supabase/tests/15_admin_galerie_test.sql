-- Galerie côté admin (consigne 20) : bucket privé, règles de chemin des fichiers, lecture
-- anon des seules photos publiées, fonctions admin (ajout, publication avec accord, texte
-- alternatif, ordre, suppression), limite de 60 photos, plafond du bucket, fichiers orphelins.
-- « Maintenant » est FIXE pour les orphelins : private.admin_gallery_orphans_at reçoit
-- lundi 4 mars 2030, 9 h à Paris, et les dates de création des fichiers sont écrites à la main.
-- Aucune vraie photo : les objets Storage sont de simples lignes (aucun contenu).
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

select plan(77);

-- Simule l'API Storage, seule autorisée à supprimer (trigger storage.protect_delete).
set local storage.allow_delete_query = 'true';

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;
delete from storage.objects where bucket_id = 'gallery';

-- Identifiants FICTIFS.
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

-- Fichiers (chemins uuid v4) : P = publiée, M = masquée, N = nouveau fichier sans ligne,
-- J = jpeg sans ligne, X = fichier dont le type ne correspond pas à l'extension.
insert into storage.objects (bucket_id, name, metadata, created_at) values
  ('gallery', 'b1500000-0000-4000-8000-00000000000a.webp', '{"mimetype": "image/webp"}', '2030-03-01 10:00+01'),
  ('gallery', 'b1500000-0000-4000-8000-00000000000b.webp', '{"mimetype": "image/webp"}', '2030-03-01 10:00+01'),
  ('gallery', 'b1500000-0000-4000-8000-00000000000c.webp', '{"mimetype": "image/webp"}', '2030-03-04 08:30+01'),
  ('gallery', 'b1500000-0000-4000-8000-00000000000d.jpg',  '{"mimetype": "image/jpeg"}', '2030-03-04 07:30+01'),
  ('gallery', 'b1500000-0000-4000-8000-00000000000e.jpg',  '{"mimetype": "image/webp"}', '2030-03-04 08:30+01');
insert into public.gallery_items (id, image_path, alt_text, width, height, sort_order, published, consent_at) values
  ('c1500000-0000-4000-8000-000000000001', 'b1500000-0000-4000-8000-00000000000a.webp',
   'Dégradé court', 1200, 800, 1, true, '2030-03-01 10:00+01'),
  ('c1500000-0000-4000-8000-000000000002', 'b1500000-0000-4000-8000-00000000000b.webp',
   'Contours nets', 800, 1200, 2, false, null);

-- Raccourcis de rôle.
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);
$$;
create function pg_temp.as_curious() returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
$$;
grant execute on function pg_temp.as_admin(), pg_temp.as_curious() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Structure et réglages.
-- ---------------------------------------------------------------------------
select is((select gallery_max_items from private.settings()), 60,
  'private.settings() : 60 photos au plus');
select is((select count(*) from pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'gallery_admin_update'), 0::bigint,
  'aucune policy de remplacement (update) sur le bucket gallery');
select throws_ok(
  $$insert into public.gallery_items (image_path, alt_text, width, height, published)
    values ('b1500000-0000-4000-8000-0000000000f1.webp', 'Sans accord', 10, 10, true)$$,
  '23514', null, 'contrainte : une photo publiée a forcément un accord (consent_at)');
select throws_ok(
  $$insert into public.gallery_items (image_path, alt_text, width, height)
    values ('../b1500000-0000-4000-8000-0000000000f2.webp', 'Chemin', 10, 10)$$,
  '23514', null, 'contrainte : chemin hors format uuid refusé même en SQL direct');
select throws_ok(
  $$insert into public.gallery_items (image_path, alt_text, width, height)
    values ('b1500000-0000-4000-8000-0000000000f3.webp', '<img src=x>', 10, 10)$$,
  '23514', null, 'contrainte : texte alternatif avec balisage refusé');
select throws_ok(
  $$insert into public.gallery_items (image_path, alt_text, width, height)
    values ('b1500000-0000-4000-8000-0000000000f4.webp', 'Trop grande', 1201, 10)$$,
  '23514', null, 'contrainte : 1200 px au plus');
select is(
  (select count(*) from unnest(array[
      'private.admin_gallery_orphans_at(timestamptz)', 'private.clean_alt_text(text)',
      'private.renumber_gallery()', 'private.settings()'
    ]) f
    where has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')),
  0::bigint, 'aucune fonction interne de la galerie exécutable par anon ou authenticated');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%gallery%'
      and (has_function_privilege('anon', p.oid, 'execute') or p.provolatile <> 'v'
           or not p.prosecdef)),
  0::bigint, 'fonctions admin de la galerie : security definer, volatile, jamais pour anon');

-- ---------------------------------------------------------------------------
-- 2. Visiteur (anon) : photos publiées seulement, colonnes d'affichage seulement.
-- ---------------------------------------------------------------------------
set local role anon;
select results_eq(
  'select image_path, alt_text, width, height from public.gallery_items order by sort_order',
  $$values ('b1500000-0000-4000-8000-00000000000a.webp'::text, 'Dégradé court'::text, 1200, 800)$$,
  'anon : ne voit que la photo publiée, avec ses dimensions');
select throws_ok('select published from public.gallery_items', '42501', null,
  'anon : ne lit pas la colonne published');
select throws_ok('select consent_at from public.gallery_items', '42501', null,
  'anon : ne lit pas la date d''accord');
select results_eq(
  $$select name from storage.objects where bucket_id = 'gallery' order by name$$,
  $$values ('b1500000-0000-4000-8000-00000000000a.webp'::text)$$,
  'anon : ne voit (donc ne signe une URL) que le fichier publié, ni masqué ni orphelin');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'b1500000-0000-4000-8000-0000000000a1.webp')$$,
  '42501', null, 'anon : ne dépose aucun fichier');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'anon : ne supprime aucun fichier, même publié');
select throws_ok('select * from public.admin_list_gallery_items()', '42501', null,
  'anon : admin_list_gallery_items refusée');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'x', 10, 10, true)$$,
  '42501', null, 'anon : admin_add_gallery_item refusée');
reset role;

-- Une photo masquée puis rendue publique change ce que voit anon (et l'inverse).
update public.gallery_items set published = false where id = 'c1500000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 0::bigint,
  'anon : une photo masquée n''est plus accessible (plus d''URL signée possible)');
reset role;
update public.gallery_items set published = true where id = 'c1500000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. Connecté NON admin : rien, nulle part.
-- ---------------------------------------------------------------------------
select pg_temp.as_curious();
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata) values ('gallery', 'b1500000-0000-4000-8000-0000000000a2.webp', '{"mimetype": "image/webp"}')$$,
  '42501', null, 'non-admin : ne dépose aucun fichier, même bien nommé');
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 0::bigint,
  'non-admin : ne liste aucun fichier');
select results_eq(
  $$with d as (delete from storage.objects where bucket_id = 'gallery' returning 1) select count(*) from d$$,
  $$values (0::bigint)$$, 'non-admin : ne supprime aucun fichier');
select throws_ok('select count(*) from public.gallery_items', '42501', null,
  'non-admin : aucun droit direct sur gallery_items');
select throws_ok('select * from public.admin_list_gallery_items()', '42501', 'forbidden',
  'non-admin : admin_list_gallery_items → forbidden');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'Coupe', 10, 10, true)$$,
  '42501', 'forbidden', 'non-admin : admin_add_gallery_item → forbidden');
select throws_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000002', true, true)$$,
  '42501', 'forbidden', 'non-admin : admin_set_gallery_item_published → forbidden');
select throws_ok(
  $$select public.admin_update_gallery_item_alt('c1500000-0000-4000-8000-000000000001', 'Pirate')$$,
  '42501', 'forbidden', 'non-admin : admin_update_gallery_item_alt → forbidden');
select throws_ok(
  $$select public.admin_move_gallery_item('c1500000-0000-4000-8000-000000000002', 'up')$$,
  '42501', 'forbidden', 'non-admin : admin_move_gallery_item → forbidden');
select throws_ok(
  $$select public.admin_delete_gallery_item('c1500000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'non-admin : admin_delete_gallery_item → forbidden');
select throws_ok('select * from public.admin_gallery_orphans()', '42501', 'forbidden',
  'non-admin : admin_gallery_orphans → forbidden');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Admin : règles de nom des fichiers dans le bucket (policy d'insertion).
-- ---------------------------------------------------------------------------
select pg_temp.as_admin();
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', '../b1500000-0000-4000-8000-0000000000a3.webp')$$,
  '42501', null, 'admin : « ../ » refusé');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'dossier/b1500000-0000-4000-8000-0000000000a3.webp')$$,
  '42501', null, 'admin : sous-dossier refusé');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'IMG_2031 Léa.jpg')$$,
  '42501', null, 'admin : nom d''origine du fichier refusé');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'b1500000-0000-4000-8000-0000000000a3.svg')$$,
  '42501', null, 'admin : extension .svg refusée');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'b1500000-0000-4000-8000-0000000000a3.png')$$,
  '42501', null, 'admin : extension .png refusée (le navigateur envoie webp ou jpg)');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'B1500000-0000-4000-8000-0000000000A3.webp')$$,
  '42501', null, 'admin : uuid en majuscules refusé (un seul nom possible par fichier)');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'b1500000-0000-1000-8000-0000000000a3.webp')$$,
  '42501', null, 'admin : uuid qui n''est pas un v4 refusé');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('gallery', 'b1500000-0000-4000-8000-0000000000a3.webp.svg')$$,
  '42501', null, 'admin : double extension refusée');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata) values ('gallery', 'b1500000-0000-4000-8000-0000000000a3.webp', '{"mimetype": "image/webp"}')$$,
  'admin : dépose un fichier « <uuid v4>.webp »');
select results_eq(
  $$with u as (update storage.objects set name = 'b1500000-0000-4000-8000-0000000000a4.webp'
                where name = 'b1500000-0000-4000-8000-0000000000a3.webp' returning 1)
    select count(*) from u$$,
  $$values (0::bigint)$$, 'admin : ne renomme ni ne remplace un fichier (aucune policy update)');

-- ---------------------------------------------------------------------------
-- 5. Admin : ajout.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.admin_add_gallery_item('../b1500000-0000-4000-8000-00000000000c.webp', 'Coupe', 10, 10, false)$$,
  'P0001', 'invalid_path', 'ajout : chemin avec « ../ » → invalid_path');
select throws_ok(
  $$select * from public.admin_add_gallery_item('autre/b1500000-0000-4000-8000-00000000000c.webp', 'Coupe', 10, 10, false)$$,
  'P0001', 'invalid_path', 'ajout : chemin d''un autre dossier → invalid_path');
select throws_ok(
  $$select * from public.admin_add_gallery_item(null, 'Coupe', 10, 10, false)$$,
  'P0001', 'invalid_path', 'ajout : chemin absent → invalid_path');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-0000000000ff.webp', 'Coupe', 10, 10, false)$$,
  'P0001', 'file_missing', 'ajout : fichier jamais envoyé → file_missing');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000e.jpg', 'Coupe', 10, 10, false)$$,
  'P0001', 'file_missing', 'ajout : type du fichier différent de son extension → file_missing');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', '   ', 10, 10, false)$$,
  'P0001', 'invalid_input', 'ajout : texte alternatif vide → invalid_input');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', repeat('a', 201), 10, 10, false)$$,
  'P0001', 'invalid_input', 'ajout : texte alternatif de 201 caractères → invalid_input');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'Coupe' || chr(8238) || 'gpj', 10, 10, false)$$,
  'P0001', 'invalid_input', 'ajout : caractère d''inversion du texte → invalid_input');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'Coupe', 0, 10, false)$$,
  'P0001', 'invalid_input', 'ajout : largeur 0 → invalid_input');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'Coupe', 10, 1201, false)$$,
  'P0001', 'invalid_input', 'ajout : hauteur 1201 → invalid_input');
select results_eq(
  $$select alt_text, width, height, sort_order, published, consent_at is null
      from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', '  Taper fade  ', 900, 1200, false)$$,
  $$values ('Taper fade'::text, 900, 1200, 3, false, true)$$,
  'ajout sans accord : enregistrée MASQUÉE, en dernier, texte nettoyé');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000c.webp', 'Encore', 10, 10, false)$$,
  'P0001', 'already_exists', 'ajout : même fichier deux fois → already_exists');
select results_eq(
  $$select sort_order, published, consent_at is not null
      from public.admin_add_gallery_item('b1500000-0000-4000-8000-00000000000d.jpg', 'Barbe taillée', 1200, 900, true)$$,
  $$values (4, true, true)$$,
  'ajout avec accord (jpeg) : publiée tout de suite, accord daté');

-- ---------------------------------------------------------------------------
-- 6. Admin : publication, texte alternatif.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000002', true, false)$$,
  'P0001', 'consent_required', 'publier sans cocher l''accord → consent_required');
select throws_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000002', true, null)$$,
  'P0001', 'consent_required', 'publier avec un accord absent (null) → consent_required');
select lives_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000002', true, true)$$,
  'publier avec l''accord');
select lives_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000001', false, false)$$,
  'masquer ne demande pas d''accord');
select throws_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-000000000001', true, false)$$,
  'P0001', 'consent_required', 'republier une photo masquée redemande l''accord');
select throws_ok(
  $$select public.admin_set_gallery_item_published('c1500000-0000-4000-8000-0000000000ff', false, false)$$,
  'P0001', 'not_found', 'publication : photo inconnue → not_found');
select lives_ok(
  $$select public.admin_update_gallery_item_alt('c1500000-0000-4000-8000-000000000002', ' Contours nets, nuque dégagée ')$$,
  'modifier le texte alternatif');
select throws_ok(
  $$select public.admin_update_gallery_item_alt('c1500000-0000-4000-8000-000000000002', 'a' || chr(10) || 'b')$$,
  'P0001', 'invalid_input', 'texte alternatif sur deux lignes → invalid_input');
select throws_ok(
  $$select public.admin_update_gallery_item_alt('c1500000-0000-4000-8000-0000000000ff', 'Coupe')$$,
  'P0001', 'not_found', 'texte alternatif : photo inconnue → not_found');
select results_eq(
  $$select alt_text, published, consent_at is not null from public.admin_list_gallery_items()
     where id in ('c1500000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-000000000002')
     order by sort_order$$,
  $$values ('Dégradé court'::text, false, true), ('Contours nets, nuque dégagée'::text, true, true)$$,
  'liste admin : masquée garde sa date d''accord, publiée a la sienne, texte enregistré');

-- ---------------------------------------------------------------------------
-- 7. Admin : ordre (A=1, B=2, C=3, D=4 avant les déplacements).
-- ---------------------------------------------------------------------------
select is(public.admin_move_gallery_item('c1500000-0000-4000-8000-000000000001', 'up'), false,
  'monter la première photo : false, rien ne bouge');
select is(public.admin_move_gallery_item('c1500000-0000-4000-8000-000000000001', 'down'), true,
  'descendre la première photo : true');
select results_eq(
  $$select image_path from public.admin_list_gallery_items()$$,
  $$values ('b1500000-0000-4000-8000-00000000000b.webp'::text),
           ('b1500000-0000-4000-8000-00000000000a.webp'::text),
           ('b1500000-0000-4000-8000-00000000000c.webp'::text),
           ('b1500000-0000-4000-8000-00000000000d.jpg'::text)$$,
  'ordre après « descendre » : B, A, C, D');
select is(
  public.admin_move_gallery_item(
    (select id from public.admin_list_gallery_items() where image_path like '%0d.jpg'), 'down'),
  false, 'descendre la dernière photo : false');
select throws_ok(
  $$select public.admin_move_gallery_item('c1500000-0000-4000-8000-000000000001', 'left')$$,
  'P0001', 'invalid_input', 'direction inconnue → invalid_input');
select throws_ok(
  $$select public.admin_move_gallery_item('c1500000-0000-4000-8000-0000000000ff', 'up')$$,
  'P0001', 'not_found', 'déplacement : photo inconnue → not_found');

-- ---------------------------------------------------------------------------
-- 8. Admin : suppression (la ligne ; le front efface ensuite le fichier).
-- ---------------------------------------------------------------------------
select is(public.admin_delete_gallery_item('c1500000-0000-4000-8000-000000000002'),
  'b1500000-0000-4000-8000-00000000000b.webp',
  'suppression : renvoie le chemin du fichier à effacer');
select throws_ok(
  $$select public.admin_delete_gallery_item('c1500000-0000-4000-8000-000000000002')$$,
  'P0001', 'not_found', 'suppression : deux fois → not_found');
select results_eq(
  $$select sort_order from public.admin_list_gallery_items()$$,
  $$values (1), (2), (3)$$, 'suppression : ordre renuméroté sans trou');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Fichiers orphelins, à date fixe (4 mars 2030, 9 h à Paris = 8 h UTC).
--    Sans ligne : a3 (déposé pendant le test : created_at = maintenant réel, bien avant 2030),
--    b (ligne supprimée à l'instant, fichier du 1er mars), e (8 h 30 : moins d'1 h, ignoré).
--    Avec ligne : a, c, d. Ordre : du plus ancien au plus récent.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select * from private.admin_gallery_orphans_at('2030-03-04 09:00 Europe/Paris')$$,
  $$values ('b1500000-0000-4000-8000-0000000000a3.webp'::text),
           ('b1500000-0000-4000-8000-00000000000b.webp'::text)$$,
  'orphelins : seuls les fichiers sans ligne de plus d''1 h');
select pg_temp.as_admin();
select lives_ok('select * from public.admin_gallery_orphans()',
  'admin : appelle admin_gallery_orphans');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Limite de 60 photos et plafond du bucket (60 + 5 fichiers).
-- ---------------------------------------------------------------------------
-- 3 lignes existent : on en ajoute 57 (60 au total), avec leurs fichiers.
with paths as (
  select gen_random_uuid()::text || '.webp' as p from generate_series(1, 57)
), files as (
  insert into storage.objects (bucket_id, name, metadata)
  select 'gallery', p, '{"mimetype": "image/webp"}' from paths returning name
)
insert into public.gallery_items (image_path, alt_text, width, height, sort_order)
select name, 'Remplissage', 10, 10, 100 from files;
insert into storage.objects (bucket_id, name, metadata)
values ('gallery', 'b1500000-0000-4000-8000-0000000000b1.webp', '{"mimetype": "image/webp"}');

select pg_temp.as_admin();
select is((select count(*) from public.admin_list_gallery_items()), 60::bigint,
  'limite : 60 photos enregistrées');
select throws_ok(
  $$select * from public.admin_add_gallery_item('b1500000-0000-4000-8000-0000000000b1.webp', 'Une de trop', 10, 10, false)$$,
  'P0001', 'gallery_limit_reached', 'limite : la 61e photo → gallery_limit_reached');
reset role;

-- Bucket : 60 fichiers des lignes + orphelins (b, e, a3, b1) = 64. Un 65e passe, pas un 66e.
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 64::bigint,
  'plafond : 64 fichiers dans le bucket');
select pg_temp.as_admin();
select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata) values ('gallery', 'b1500000-0000-4000-8000-0000000000b2.webp', '{"mimetype": "image/webp"}')$$,
  'plafond : 65e fichier accepté (marge de 5 pour les envois interrompus)');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata) values ('gallery', 'b1500000-0000-4000-8000-0000000000b3.webp', '{"mimetype": "image/webp"}')$$,
  '42501', null, 'plafond : 66e fichier refusé par Storage (protège le quota)');
reset role;

select * from finish();
rollback;
