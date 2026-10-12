-- Réservation idempotente (consigne 25, C-05, ADR 0009) : même clé + mêmes données dans les
-- 30 min = même récapitulatif (même jeton), rien de créé, plafond non déclenché ; tout autre
-- rejeu = request_conflict. La concurrence réelle (deux connexions) est dans 25_….
-- « Maintenant » est FIXE : private.create_booking_at reçoit samedi 1er juin 2030, 8 h 30 à
-- Paris (puis + 10, 29 et 31 min). Rien ne dépend de la date du jour.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- Identifiants et coordonnées FICTIFS.
insert into public.services (id, name, duration_min, active) values
  ('14000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('14000000-0000-4000-8000-000000000002', 'Coupe + barbe', 60, true);
insert into public.locations (id, public_label, active) values
  ('24000000-0000-4000-8000-000000000001', 'Lieu un', true);
-- Mer. 12/06/2030 10 h – 18 h : grille 10:00, 11:10, 12:20, 13:30, 14:40, 15:50, 17:00.
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('24000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris', '2030-06-12 18:00 Europe/Paris');

-- Réserver à une date fixe « maintenant + p_minutes », avec une clé (ou sans : null).
create function pg_temp.book(
  p_minutes integer, p_starts text, p_phone text, p_email text, p_key uuid,
  p_service uuid default '14000000-0000-4000-8000-000000000001', p_first text default 'Zoé'
) returns uuid
language sql as $$
  select cancel_token from private.create_booking_at(
    '2030-06-01 08:30 Europe/Paris'::timestamptz + make_interval(mins => p_minutes),
    p_service, (p_starts || ' Europe/Paris')::timestamptz, '24000000-0000-4000-8000-000000000001',
    p_first, 'Durand', p_phone, p_email, null, p_key);
$$;

create function pg_temp.confirmed() returns bigint
language sql as $$ select count(*) from public.bookings where status = 'confirmed'; $$;

-- ---------------------------------------------------------------------------
-- 1. Règle et stockage.
-- ---------------------------------------------------------------------------
select is((select request_replay_window from private.settings()), interval '30 minutes',
  'private.settings() : rejeu accepté pendant 30 min');

-- Première réservation, clé K1.
create temp table t1 as
  select pg_temp.book(0, '2030-06-12 10:00', '0639980001', null,
                      'aaaaaaaa-0000-4000-8000-000000000001') as token;
select is(pg_temp.confirmed(), 1::bigint, 'clé K1 : réservation créée');
select is(
  (select request_key_hash from public.bookings),
  sha256(convert_to('aaaaaaaa-0000-4000-8000-000000000001', 'UTF8')),
  'stockage : empreinte sha256 de la clé');
select is_empty(
  $$select 1 from public.bookings b
     where to_jsonb(b)::text ilike '%aaaaaaaa-0000-4000-8000-000000000001%'$$,
  'stockage : la clé elle-même n''est jamais stockée');
select is(
  (select created_at from public.bookings), '2030-06-01 08:30 Europe/Paris'::timestamptz,
  'created_at = « maintenant » de la fonction (fenêtre de rejeu sur la même horloge)');

-- ---------------------------------------------------------------------------
-- 2. Rejeu identique : même jeton, rien de créé.
-- ---------------------------------------------------------------------------
select is(
  pg_temp.book(29, '2030-06-12 10:00', '0639980001', null, 'aaaaaaaa-0000-4000-8000-000000000001'),
  (select token from t1),
  'rejeu identique à + 29 min : même jeton');
select is(pg_temp.confirmed(), 1::bigint, 'rejeu : aucune réservation de plus');
select is(
  pg_temp.book(10, '2030-06-12 10:00', '06 39 98 00 01', null,
               'aaaaaaaa-0000-4000-8000-000000000001'),
  (select token from t1),
  'rejeu : même numéro écrit autrement (espaces) = mêmes coordonnées');

-- ---------------------------------------------------------------------------
-- 3. Rejeu différent : refusé, sans rien révéler.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select pg_temp.book(5, '2030-06-12 11:10', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'request_conflict', 'même clé, autre créneau : request_conflict');
select throws_ok(
  $$select pg_temp.book(5, '2030-06-12 10:00', '0639980002', null,
                        'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'request_conflict', 'même clé, autre téléphone : request_conflict');
select throws_ok(
  $$select pg_temp.book(5, '2030-06-12 10:00', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000001', p_first => 'Léa')$$,
  'P0001', 'request_conflict', 'même clé, autre prénom : request_conflict');
select throws_ok(
  $$select pg_temp.book(5, '2030-06-12 10:00', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000001',
                        '14000000-0000-4000-8000-000000000002')$$,
  'P0001', 'request_conflict', 'même clé, autre prestation : request_conflict');
select throws_ok(
  $$select pg_temp.book(31, '2030-06-12 10:00', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'request_conflict', 'rejeu identique à + 31 min : request_conflict (fenêtre dépassée)');

-- ---------------------------------------------------------------------------
-- 4. Plafond de 2 RDV futurs : jamais déclenché par un rejeu.
-- ---------------------------------------------------------------------------
select isnt(
  pg_temp.book(1, '2030-06-12 11:10', '0639980001', null, 'aaaaaaaa-0000-4000-8000-000000000002'),
  null, 'clé K2 : 2e RDV du même téléphone accepté');
select throws_ok(
  $$select pg_temp.book(2, '2030-06-12 12:20', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000003')$$,
  'P0001', 'limit_reached', 'clé K3 (nouvelle réservation) : 3e RDV refusé, plafond atteint');
select is(
  pg_temp.book(3, '2030-06-12 10:00', '0639980001', null, 'aaaaaaaa-0000-4000-8000-000000000001'),
  (select token from t1),
  'plafond atteint : le rejeu de K1 renvoie quand même son récapitulatif');

-- ---------------------------------------------------------------------------
-- 5. Sans clé : comportement d'avant (pas de rejeu possible, créneau pris).
-- ---------------------------------------------------------------------------
select isnt(pg_temp.book(0, '2030-06-12 13:30', null, 'zoe@example.test', null), null,
  'sans clé : réservation créée normalement');
select throws_ok(
  $$select pg_temp.book(1, '2030-06-12 13:30', null, 'zoe@example.test', null)$$,
  'P0001', 'slot_unavailable', 'sans clé : un second envoi identique trouve le créneau pris');

-- ---------------------------------------------------------------------------
-- 6. RDV annulé : son rejeu est refusé (on ne ressuscite pas une réservation).
-- ---------------------------------------------------------------------------
select is(private.cancel_booking_at('2030-06-01 08:40 Europe/Paris', (select token from t1)), true,
  'K1 annulé par le client');
select throws_ok(
  $$select pg_temp.book(12, '2030-06-12 10:00', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000001')$$,
  'P0001', 'request_conflict', 'rejeu d''un RDV annulé : request_conflict');

-- Annulé par Alix (K2, créé à + 1 min) : même refus.
update public.bookings set status = 'cancelled', cancelled_by = 'barber'
 where request_key_hash = sha256(convert_to('aaaaaaaa-0000-4000-8000-000000000002', 'UTF8'));
select throws_ok(
  $$select pg_temp.book(5, '2030-06-12 11:10', '0639980001', null,
                        'aaaaaaaa-0000-4000-8000-000000000002')$$,
  'P0001', 'request_conflict', 'rejeu d''un RDV annulé par Alix : request_conflict');

-- ---------------------------------------------------------------------------
-- 7. Fonction PUBLIQUE create_booking : p_request_id est bien transmis (now() réel, dispo
--    dans deux jours, sur la grille, dans la fenêtre de 2 h à 4 semaines).
-- ---------------------------------------------------------------------------
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('24000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '2 days', date_trunc('hour', now()) + interval '2 days 2 hours');
create temp table pub_tokens (token uuid);
insert into pub_tokens
  select cancel_token from public.create_booking(
    '14000000-0000-4000-8000-000000000001', date_trunc('hour', now()) + interval '2 days',
    '24000000-0000-4000-8000-000000000001', 'Zoé', 'Public', '0639980050', null, null,
    'aaaaaaaa-0000-4000-8000-000000000004');
insert into pub_tokens
  select cancel_token from public.create_booking(
    '14000000-0000-4000-8000-000000000001', date_trunc('hour', now()) + interval '2 days',
    '24000000-0000-4000-8000-000000000001', 'Zoé', 'Public', '0639980050', null, null,
    'aaaaaaaa-0000-4000-8000-000000000004');
select is((select count(*) from pub_tokens), 2::bigint,
  'create_booking public, même clé deux fois : deux récapitulatifs');
select is((select count(distinct token) from pub_tokens), 1::bigint,
  'create_booking public : le même jeton les deux fois');
select is(
  (select count(*) from public.bookings
    where request_key_hash = sha256(convert_to('aaaaaaaa-0000-4000-8000-000000000004', 'UTF8'))),
  1::bigint,
  'create_booking public : une seule réservation');

-- ---------------------------------------------------------------------------
-- 8. Garde-fou : jamais le jeton d'un RDV déjà commencé. Impossible avec les règles actuelles
--    (2 h minimum contre 30 min de rejeu) : on ramène min_notice à 0 le temps du test (la
--    transaction est annulée à la fin).
-- ---------------------------------------------------------------------------
create or replace function private.settings()
returns table (
  slot_step interval, min_notice interval, max_advance interval, cancel_notice interval,
  max_future_bookings integer, data_retention interval, gallery_max_items integer,
  request_replay_window interval
)
language sql stable set search_path = ''
as $$
  select interval '70 minutes', interval '0 minutes', interval '28 days', interval '24 hours',
         2, interval '6 months', 60, interval '30 minutes';
$$;
select isnt(
  (select cancel_token from private.create_booking_at(
     '2030-06-12 15:40 Europe/Paris', '14000000-0000-4000-8000-000000000001',
     '2030-06-12 15:50 Europe/Paris', '24000000-0000-4000-8000-000000000001',
     'Zoé', 'Bientôt', '0639980060', null, null, 'aaaaaaaa-0000-4000-8000-000000000005')),
  null, 'RDV à 15 h 50 réservé à 15 h 40 (délai minimum ramené à 0 pour le test)');
select throws_ok(
  $$select * from private.create_booking_at(
     '2030-06-12 15:55 Europe/Paris', '14000000-0000-4000-8000-000000000001',
     '2030-06-12 15:50 Europe/Paris', '24000000-0000-4000-8000-000000000001',
     'Zoé', 'Bientôt', '0639980060', null, null, 'aaaaaaaa-0000-4000-8000-000000000005')$$,
  'P0001', 'request_conflict',
  'rejeu à 15 h 55 (dans les 30 min, mais RDV commencé) : request_conflict, pas de jeton');

select * from finish();
rollback;
