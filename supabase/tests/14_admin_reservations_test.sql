-- Réservations côté admin (consigne 19) : droits des 3 profils, liste sans contact, détail avec
-- contact, annulation par le barber (futur, à moins de 24 h, en cours, passé, déjà annulé,
-- inconnu), créneau rouvert, limite de 2 RDV libérée, cancelled_by vu par le lien client.
-- « Maintenant » est FIXE : les fonctions private.…_at reçoivent lundi 4 mars 2030, 9 h à
-- Paris. Les appels aux vraies fonctions (avec now()) ne servent qu'aux droits et à la forme
-- des réponses : toutes les données sont en 2030, donc « futures » pour now().
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

select plan(52);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants et contacts FICTIFS (jamais un vrai numéro, un vrai e-mail ni une vraie adresse).
insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true);

insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2030-02-02 07:00 Europe/Paris', '2030-02-02 11:00 Europe/Paris'),
  ('20000000-0000-4000-8000-000000000001', '2030-02-20 10:00 Europe/Paris', '2030-02-20 12:00 Europe/Paris'),
  ('20000000-0000-4000-8000-000000000001', '2030-03-04 08:30 Europe/Paris', '2030-03-04 10:00 Europe/Paris'),
  ('20000000-0000-4000-8000-000000000001', '2030-03-04 14:00 Europe/Paris', '2030-03-04 16:00 Europe/Paris'),
  -- Mer. 6 mars 10 h – 13 h 30 : grille 10:00, 11:10, 12:20 (48 h et plus après « maintenant »).
  ('20000000-0000-4000-8000-000000000001', '2030-03-06 10:00 Europe/Paris', '2030-03-06 13:30 Europe/Paris');

-- ends_at est recalculé par le trigger (starts_at + 60 min) : la valeur fournie est ignorée.
insert into public.bookings
  (id, cancel_token, service_id, location_id, starts_at, ends_at, first_name, last_name, phone, email,
   status, cancelled_by)
values
  -- B1 futur, confirmé, téléphone + e-mail.
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-03-06 10:00 Europe/Paris', now(), 'Léa', 'Martin', '0700000001', 'lea@example.test',
   'confirmed', null),
  -- B2 futur, déjà annulé par le client.
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-03-06 11:10 Europe/Paris', now(), 'Tom', 'Durand', '0700000002', null,
   'cancelled', 'client'),
  -- B3 en cours à 9 h (8 h 30 – 9 h 30).
  ('60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-03-04 08:30 Europe/Paris', now(), 'Eva', 'Petit', '0700000003', null,
   'confirmed', null),
  -- B4 dans 6 h (moins de 24 h), e-mail seulement.
  ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-03-04 15:00 Europe/Paris', now(), 'Noé', 'Roux', null, 'noe@example.test',
   'confirmed', null),
  -- B5 passé, il y a 12 jours.
  ('60000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-02-20 10:00 Europe/Paris', now(), 'Ana', 'Blanc', '0700000005', null,
   'confirmed', null),
  -- B6 passé, commencé il y a 30 jours PILE : encore dans « Passées ».
  ('60000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000006',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-02-02 09:00 Europe/Paris', now(), 'Jade', 'Noir', '0700000006', null,
   'confirmed', null),
  -- B7 passé, commencé il y a 30 jours et 1 minute : hors fenêtre.
  ('60000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000007',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-02-02 07:59 Europe/Paris', now(), 'Max', 'Vert', '0700000007', null,
   'confirmed', null),
  -- B8 futur, même téléphone que B1 : Léa a atteint la limite de 2 RDV futurs.
  ('60000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000008',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2030-03-06 12:20 Europe/Paris', now(), 'Léa', 'Martin', '0700000001', null,
   'confirmed', null);

-- Raccourcis à date fixe (lundi 4 mars 2030, 9 h, Paris).
create function pg_temp.list_at(p_scope text) returns setof text
language sql as $$
  select l.first_name from private.admin_list_bookings_at('2030-03-04 09:00 Europe/Paris', p_scope) l;
$$;
create function pg_temp.cancel_at(p_id uuid) returns boolean
language sql as $$
  select private.admin_cancel_booking_at('2030-03-04 09:00 Europe/Paris', p_id);
$$;
create function pg_temp.slots_wed() returns setof text
language sql as $$
  select to_char(s.starts_at at time zone 'Europe/Paris', 'HH24:MI')
    from private.compute_slots('10000000-0000-4000-8000-000000000001', '2030-03-06',
                               '2030-03-04 09:00 Europe/Paris') s;
$$;
create function pg_temp.book_lea(p_time text) returns void
language plpgsql as $$
begin
  perform * from private.create_booking_at(
    '2030-03-04 09:00 Europe/Paris', '10000000-0000-4000-8000-000000000001',
    ('2030-03-06 ' || p_time || ' Europe/Paris')::timestamptz,
    '20000000-0000-4000-8000-000000000001', 'Léa', 'Martin', '0700000001', null, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Structure et droits d'exécution.
-- ---------------------------------------------------------------------------
select throws_ok($$insert into public.bookings (service_id, location_id, starts_at, ends_at,
      first_name, last_name, phone, status, cancelled_by)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            '2030-03-04 14:00 Europe/Paris', now(), 'X', 'Y', '0700000099', 'confirmed', 'barber')$$,
  '23514', null, 'contrainte : un RDV confirmé n''a pas de cancelled_by');
select throws_ok($$insert into public.bookings (service_id, location_id, starts_at, ends_at,
      first_name, last_name, phone, status, cancelled_by)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            '2030-03-04 14:00 Europe/Paris', now(), 'X', 'Y', '0700000099', 'cancelled', null)$$,
  '23514', null, 'contrainte : un RDV annulé dit qui l''a annulé');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_list_bookings', 'admin_get_booking', 'admin_cancel_booking')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  3::bigint, 'les 3 fonctions admin : security definer, search_path vide');

select ok(not has_function_privilege('anon', 'public.admin_list_bookings(text)', 'execute'),
  'anon : admin_list_bookings non exécutable');
select ok(not has_function_privilege('anon', 'public.admin_get_booking(uuid)', 'execute'),
  'anon : admin_get_booking non exécutable');
select ok(not has_function_privilege('anon', 'public.admin_cancel_booking(uuid)', 'execute'),
  'anon : admin_cancel_booking non exécutable');
select ok(has_function_privilege('authenticated', 'public.admin_list_bookings(text)', 'execute')
      and has_function_privilege('authenticated', 'public.admin_get_booking(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.admin_cancel_booking(uuid)', 'execute'),
  'authenticated : exécute les 3 fonctions (le contrôle admin est dedans)');
select is(
  (select count(*) from unnest(array[
      'private.admin_list_bookings_at(timestamptz, text)',
      'private.admin_cancel_booking_at(timestamptz, uuid)',
      'private.get_booking_at(timestamptz, uuid)',
      'private.cancel_booking_at(timestamptz, uuid)'
    ]) f
    where has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')),
  0::bigint, 'aucune fonction interne exécutable par anon ou authenticated');
select set_eq(
  $$select n.nspname || '.' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and has_function_privilege('authenticated', p.oid, 'execute')$$,
  array['private.is_admin', 'private.is_safe_text', 'public.admin_booking_rules',
        'public.admin_cancel_booking', 'public.admin_create_availability',
        'public.admin_delete_availability', 'public.admin_get_booking',
        'public.admin_list_availabilities', 'public.admin_list_bookings',
        -- Consigne 20 : galerie (fonctions admin et 2 aides des policies Storage).
        'private.is_gallery_path', 'private.gallery_bucket_has_room',
        'public.admin_list_gallery_items', 'public.admin_add_gallery_item',
        'public.admin_set_gallery_item_published', 'public.admin_update_gallery_item_alt',
        'public.admin_move_gallery_item', 'public.admin_delete_gallery_item',
        'public.admin_hide_gallery_item',
        'public.admin_gallery_orphans'],
  'authenticated n''exécute que les fonctions admin et les 4 aides des policies');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_list_bookings', 'admin_get_booking', 'admin_cancel_booking')
      and p.provolatile = 'v'),
  3::bigint, 'les 3 fonctions admin sont volatile : jamais appelables en GET');
select ok(has_function_privilege('anon', 'public.get_booking(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.get_booking(uuid)', 'execute'),
  'get_booking recréée : anon seulement, comme avant');

-- ---------------------------------------------------------------------------
-- 2. Visiteur (anon) : rien.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.admin_list_bookings('upcoming')$$, '42501', null,
  'anon : ne liste pas les réservations');
select throws_ok($$select * from public.admin_get_booking('60000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon : ne lit pas le détail d''une réservation');
select throws_ok($$select public.admin_cancel_booking('60000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon : n''annule pas');
select throws_ok('select count(*) from public.bookings', '42501', null,
  'anon : aucun droit sur bookings');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Connecté SANS ligne dans admins : « forbidden » partout, aucune donnée.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select throws_ok($$select * from public.admin_list_bookings('upcoming')$$, '42501', 'forbidden',
  'non-admin : ne liste pas les réservations');
select throws_ok($$select * from public.admin_get_booking('60000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'non-admin : ne lit pas le détail');
select throws_ok($$select public.admin_cancel_booking('60000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'non-admin : n''annule pas');
select throws_ok('select count(*) from public.bookings', '42501', null,
  'non-admin : aucun droit sur bookings');
-- Le contrôle admin passe AVANT la validation : un non-admin n'apprend pas si un id existe.
select throws_ok($$select * from public.admin_get_booking('69999999-0000-4000-8000-000000000000')$$,
  '42501', 'forbidden', 'non-admin, id inconnu : forbidden (et non not_found)');
select throws_ok($$select public.admin_cancel_booking(null)$$,
  '42501', 'forbidden', 'non-admin, id absent : forbidden (et non invalid_input)');
reset role;
select is((select status from public.bookings where id = '60000000-0000-4000-8000-000000000001'),
  'confirmed', 'après les tentatives anon et non-admin : B1 toujours confirmé');

-- ---------------------------------------------------------------------------
-- 4. Admin : vraies fonctions (now()). Forme des réponses, pas d'accès direct.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is((select count(*) from public.admin_list_bookings('upcoming')), 8::bigint,
  'admin : liste les réservations (toutes en 2030, donc à venir pour now())');
select is(
  (select count(*) from public.admin_list_bookings('upcoming') l
    where to_jsonb(l) ?| array['phone', 'email', 'cancel_token', 'private_address']
       or to_jsonb(l)::text like '%example.test%' or to_jsonb(l)::text like '%07000000%'
       or to_jsonb(l)::text like '%secrète%'),
  0::bigint, 'liste : ni téléphone, ni e-mail, ni jeton, ni adresse');
select results_eq(
  $$select first_name, last_name, service_name, location_label, phone, email, status, cancelled_by
      from public.admin_get_booking('60000000-0000-4000-8000-000000000001')$$,
  $$values ('Léa'::text, 'Martin'::text, 'Coupe'::text, 'Ville un'::text, '0700000001'::text,
            'lea@example.test'::text, 'confirmed'::text, null::text)$$,
  'détail : contact du client, prestation et ville');
select results_eq(
  $$select phone, email from public.admin_get_booking('60000000-0000-4000-8000-000000000004')$$,
  $$values (null::text, 'noe@example.test'::text)$$,
  'détail : client sans téléphone, l''e-mail est le seul moyen de le prévenir');
select is(
  (select count(*) from public.admin_get_booking('60000000-0000-4000-8000-000000000001') g
    where to_jsonb(g) ?| array['cancel_token', 'private_address']
       or to_jsonb(g)::text like '%secrète%'),
  0::bigint, 'détail : ni jeton d''annulation, ni adresse privée');
select throws_ok($$select * from public.admin_get_booking('69999999-0000-4000-8000-000000000000')$$,
  'P0001', 'not_found', 'détail : identifiant inconnu → not_found');
select throws_ok($$select * from public.admin_get_booking(null)$$,
  'P0001', 'invalid_input', 'détail : identifiant absent → invalid_input');
select throws_ok($$select * from public.admin_list_bookings('all')$$,
  'P0001', 'invalid_input', 'liste : portée inconnue → invalid_input');
select throws_ok(
  $$update public.bookings set status = 'cancelled', cancelled_by = 'barber'$$, '42501', null,
  'admin : pas d''annulation directe (contournerait admin_cancel_booking)');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Listes à date fixe (lundi 4 mars 2030, 9 h).
-- ---------------------------------------------------------------------------
select results_eq($$select * from pg_temp.list_at('upcoming')$$,
  $$values ('Eva'::text), ('Noé'::text), ('Léa'::text), ('Tom'::text), ('Léa'::text)$$,
  'à venir : chronologique, RDV en cours compris, annulés compris');
select results_eq($$select * from pg_temp.list_at('past')$$,
  $$values ('Ana'::text), ('Jade'::text)$$,
  'passées : plus récent d''abord, 30 jours pile compris, 30 jours et 1 minute exclus');

-- ---------------------------------------------------------------------------
-- 6. Annulation par le barber, à date fixe.
-- ---------------------------------------------------------------------------
select results_eq('select * from pg_temp.slots_wed()', $$values ('11:10'::text)$$,
  'avant : 10:00 (B1) et 12:20 (B8) pris, 11:10 libre (B2 annulé)');
select throws_ok($$select pg_temp.book_lea('11:10')$$,
  'P0001', 'limit_reached', 'avant : Léa a 2 RDV futurs, limite atteinte');

select is(pg_temp.cancel_at('60000000-0000-4000-8000-000000000001'), true,
  'RDV futur : annulé (true)');
select results_eq(
  $$select status, cancelled_by from public.bookings where id = '60000000-0000-4000-8000-000000000001'$$,
  $$values ('cancelled'::text, 'barber'::text)$$, 'RDV futur : cancelled_by = barber');
select is(pg_temp.cancel_at('60000000-0000-4000-8000-000000000001'), false,
  'double annulation : false, rien de plus');
select results_eq('select * from pg_temp.slots_wed()', $$values ('10:00'::text), ('11:10'::text)$$,
  'créneau rouvert : 10:00 de nouveau proposé aux clients');
select lives_ok($$select pg_temp.book_lea('10:00')$$,
  'Léa réserve de nouveau : créneau rouvert et limite libérée');

select is(pg_temp.cancel_at('60000000-0000-4000-8000-000000000002'), false,
  'RDV déjà annulé par le client : false');
select is((select cancelled_by from public.bookings where id = '60000000-0000-4000-8000-000000000002'),
  'client', 'RDV déjà annulé par le client : reste « client »');
select is(pg_temp.cancel_at('60000000-0000-4000-8000-000000000004'), true,
  'RDV dans 6 h : annulé, pas de délai de 24 h pour le barber');
select throws_ok($$select pg_temp.cancel_at('60000000-0000-4000-8000-000000000003')$$,
  'P0001', 'already_started', 'RDV en cours : already_started');
select throws_ok($$select pg_temp.cancel_at('60000000-0000-4000-8000-000000000005')$$,
  'P0001', 'already_started', 'RDV passé : already_started');
select results_eq(
  $$select status from public.bookings
     where id in ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000005')$$,
  $$values ('confirmed'::text), ('confirmed'::text)$$, 'RDV en cours et passé : inchangés');
select throws_ok($$select pg_temp.cancel_at('69999999-0000-4000-8000-000000000000')$$,
  'P0001', 'not_found', 'identifiant inconnu : not_found');
select throws_ok($$select pg_temp.cancel_at(null)$$,
  'P0001', 'invalid_input', 'identifiant absent : invalid_input');

-- ---------------------------------------------------------------------------
-- 7. Le lien client voit qui a annulé.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select status, cancelled_by, can_cancel
      from private.get_booking_at('2030-03-04 09:00 Europe/Paris', '40000000-0000-4000-8000-000000000001')$$,
  $$values ('cancelled'::text, 'barber'::text, false)$$,
  'get_booking : RDV annulé par le barber, distinct d''une annulation client');
select is(private.cancel_booking_at('2030-03-04 09:00 Europe/Paris', '40000000-0000-4000-8000-000000000008'),
  true, 'annulation par le lien client : toujours possible à plus de 24 h');
select results_eq(
  $$select status, cancelled_by
      from private.get_booking_at('2030-03-04 09:00 Europe/Paris', '40000000-0000-4000-8000-000000000008')$$,
  $$values ('cancelled'::text, 'client'::text)$$,
  'annulation par le lien client : cancelled_by = client');
select is(
  (select count(*)
     from private.get_booking_at('2030-03-04 09:00 Europe/Paris', '40000000-0000-4000-8000-000000000001') g
    where to_jsonb(g) ?| array['private_address', 'phone', 'email', 'last_name', 'id', 'cancel_token']),
  0::bigint, 'get_booking recréée : toujours ni adresse, ni contact, ni nom, ni identifiant');

select * from finish();
rollback;
