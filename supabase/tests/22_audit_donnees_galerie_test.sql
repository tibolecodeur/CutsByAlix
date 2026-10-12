-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : données piégées dans TOUS les champs texte
-- publics (create_booking) et admin (texte alternatif), puis configuration du bucket galerie.
-- Règle attendue : une valeur est soit REFUSÉE (invalid_input), soit stockée À L'IDENTIQUE
-- (après btrim) ; jamais exécutée, jamais tronquée en silence.
-- « Maintenant » FIXE : samedi 1er juin 2030, 8 h 30 à Paris.
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

select plan(16);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into auth.users (id, email) values ('32000000-0000-4000-8000-000000000001', 'admin@example.test');
insert into public.admins (user_id) values ('32000000-0000-4000-8000-000000000001');
insert into public.services (id, name, duration_min, active) values
  ('1b000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, private_address, active) values
  ('2b000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse factice', true);
-- Une longue dispo : un créneau libre par essai accepté (grille de 70 min).
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('2b000000-0000-4000-8000-000000000001', '2030-06-12 00:00 Europe/Paris', '2030-06-12 23:59 Europe/Paris');

-- Essaie une réservation et renvoie 'ok' ou le message d'erreur. Le créneau change à chaque
-- appel réussi ; un téléphone différent à chaque fois pour ne pas toucher la limite de 2.
create sequence pg_temp.n;
create function pg_temp.try_book(p_first text, p_last text, p_phone text, p_email text) returns text
language plpgsql as $$
declare
  v_slot timestamptz := (select min(s.starts_at) from private.compute_slots(
    '1b000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris') s);
begin
  perform private.create_booking_at('2030-06-01 08:30 Europe/Paris',
    '1b000000-0000-4000-8000-000000000001', v_slot, '2b000000-0000-4000-8000-000000000001',
    p_first, p_last,
    coalesce(p_phone, case when p_email is null then '06' || lpad(nextval('pg_temp.n')::text, 8, '0') end),
    p_email, null);
  return 'ok';
exception when raise_exception then
  return sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Valeurs REFUSÉES (prénom, nom, téléphone, e-mail).
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(label, ', ' order by label) from (values
     ('prénom vide',               pg_temp.try_book('', 'Martin', null, null)),
     ('prénom espaces seuls',      pg_temp.try_book('   ', 'Martin', null, null)),
     ('prénom NULL',               pg_temp.try_book(null, 'Martin', null, null)),
     ('prénom 51 caractères',      pg_temp.try_book(repeat('a', 51), 'Martin', null, null)),
     ('prénom 10 000 caractères',  pg_temp.try_book(repeat('a', 10000), 'Martin', null, null)),
     ('prénom avec guillemet "',   pg_temp.try_book('Lé"a', 'Martin', null, null)),
     ('prénom <script>',           pg_temp.try_book('<script>alert(1)</script>', 'Martin', null, null)),
     ('prénom formule =1+1',       pg_temp.try_book('=1+1', 'Martin', null, null)),
     ('prénom tabulation',         pg_temp.try_book(E'L\tea', 'Martin', null, null)),
     ('prénom retour ligne',       pg_temp.try_book(E'Léa\nX', 'Martin', null, null)),
     ('prénom caractère nul U+0',  pg_temp.try_book('Léa' || chr(1), 'Martin', null, null)),
     ('prénom inversion RTL',      pg_temp.try_book('Léa' || U&'\202E', 'Martin', null, null)),
     ('prénom espace invisible',   pg_temp.try_book('Lé' || U&'\200B' || 'a', 'Martin', null, null)),
     ('nom vide',                  pg_temp.try_book('Léa', '', null, null)),
     ('nom 51 caractères',         pg_temp.try_book('Léa', repeat('b', 51), null, null)),
     ('ni téléphone ni e-mail',    pg_temp.try_book('Léa', 'Martin', '', '')),
     ('téléphone lettres',         pg_temp.try_book('Léa', 'Martin', '06abcdefgh', null)),
     ('téléphone 9 chiffres',      pg_temp.try_book('Léa', 'Martin', '061234567', null)),
     ('téléphone SQL',             pg_temp.try_book('Léa', 'Martin', '0612345678; drop table bookings', null)),
     ('e-mail sans @',             pg_temp.try_book('Léa', 'Martin', null, 'lea.example.test')),
     ('e-mail avec <>',            pg_temp.try_book('Léa', 'Martin', null, '<lea>@example.test')),
     ('e-mail 255 caractères',     pg_temp.try_book('Léa', 'Martin', null, repeat('a', 242) || '@example.test'))
   ) t(label, result) where result <> 'invalid_input'),
  null,
  '22 valeurs piégées refusées avec invalid_input (aucune autre erreur, aucune acceptée)');

select throws_ok($$select private.create_booking_at('2030-06-01 08:30 Europe/Paris',
    '1b000000-0000-4000-8000-000000000001', '2030-06-12 00:00 Europe/Paris',
    '2b000000-0000-4000-8000-000000000001', 'Léa', 'Martin', '0612345678', null, 'https://spam.example')$$,
  'P0001', 'invalid_input', 'honeypot rempli : refusé');
select is((select count(*) from public.bookings), 0::bigint, 'aucune des valeurs refusées n''a créé de RDV');

-- ---------------------------------------------------------------------------
-- 2. Valeurs ACCEPTÉES et stockées à l'identique (après btrim).
-- ---------------------------------------------------------------------------
select is(pg_temp.try_book('Zoë 💈', 'O''Brien', null, null), 'ok', 'emoji et apostrophe : acceptés');
select is((select first_name || '|' || last_name from public.bookings order by created_at desc, starts_at desc limit 1),
  'Zoë 💈|O''Brien', '… stockés à l''identique');
select is(pg_temp.try_book(''');drop table public.bookings;--', 'Robert''); --', null, null), 'ok',
  'injection SQL classique en prénom et nom : acceptée comme simple texte');
select is((select first_name from public.bookings where last_name = 'Robert''); --'),
  ''');drop table public.bookings;--', '… stockée telle quelle, jamais exécutée (la table existe)');
select is(pg_temp.try_book('  Léa  ', '  Martin ', null, '  LEA@Example.TEST '), 'ok',
  'espaces autour : acceptés');
select is((select first_name || '|' || last_name || '|' || email from public.bookings where email is not null),
  'Léa|Martin|lea@example.test', '… nettoyés (btrim) et e-mail en minuscules');
select is(pg_temp.try_book(repeat('é', 50), repeat('😀', 50), null, null), 'ok',
  '50 caractères accentués / 50 emojis (limite en caractères, pas en octets) : acceptés');
-- Constat A-05 : « + », « - », « @ » en tête restent possibles (seul « = » est bloqué). Sans
-- export CSV aujourd'hui, ce n'est pas exploitable ; à revoir si un export est ajouté.
select is(pg_temp.try_book('@SUM(1)', '-2+3', null, null), 'ok',
  'constat A-05 : @ et - en tête acceptés (comportement actuel, pas d''export CSV)');

-- ---------------------------------------------------------------------------
-- 3. Texte alternatif de la galerie : private.clean_alt_text, appelée par toutes les RPC admin
--    qui écrivent ce texte (ajout, modification).
-- ---------------------------------------------------------------------------
create function pg_temp.try_alt(p_alt text) returns text
language plpgsql as $$
begin
  perform private.clean_alt_text(p_alt);
  return 'ok';
exception when raise_exception then
  return sqlerrm;
end $$;
select is(
  concat_ws(',', pg_temp.try_alt(''), pg_temp.try_alt('   '), pg_temp.try_alt(repeat('a', 201)),
                 pg_temp.try_alt('<img src=x onerror=alert(1)>'), pg_temp.try_alt(E'a\nb'),
                 pg_temp.try_alt('a' || U&'\202E')),
  'invalid_input,invalid_input,invalid_input,invalid_input,invalid_input,invalid_input',
  'texte alternatif vide, trop long, HTML, retour ligne, RTL : refusés');
select is(pg_temp.try_alt('Dégradé 💈 « net » d''Alix'), 'ok', 'texte alternatif accentué, emoji, apostrophe : accepté');

-- ---------------------------------------------------------------------------
-- 4. Bucket galerie : privé, types et taille limités, aucune policy pour anon en écriture.
--    (L'API Storage applique types et taille ; vérifié en vrai par la sonde locale du rapport.)
-- ---------------------------------------------------------------------------
select results_eq(
  $$select public, file_size_limit, allowed_mime_types::text from storage.buckets where id = 'gallery'$$,
  $$values (false, 2097152::bigint, '{image/webp,image/jpeg}'::text)$$,
  'bucket gallery : privé, 2 Mo, webp et jpeg seulement (ni SVG, ni HTML, ni PNG)');
select is_empty(
  $$select policyname from pg_policies
     where schemaname = 'storage' and 'anon' = any (roles) and cmd <> 'SELECT'$$,
  'aucune policy Storage d''écriture pour anon');
-- anon : ne voit pas un fichier dont la photo n'est pas publiée (la policy s'appuie sur la
-- RLS de gallery_items, qui ne montre que les photos publiées).
insert into public.gallery_items (image_path, alt_text, width, height, published, consent_at) values
  ('a2200000-0000-4000-8000-000000000002.webp', 'Masquée', 800, 600, false, null);
insert into storage.objects (bucket_id, name) values ('gallery', 'a2200000-0000-4000-8000-000000000002.webp');
set local role anon;
select is((select count(*) from storage.objects where bucket_id = 'gallery'), 0::bigint,
  'anon : aucun objet visible (le fichier existant n''est pas publié)');
reset role;

select * from finish();
rollback;
