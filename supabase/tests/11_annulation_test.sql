-- Annulation par lien (consigne 16) : règle des 24 h aux limites, double annulation, jeton
-- inconnu, lien expiré, créneau libéré, décompte des 2 RDV futurs, absence de fuite, droits.
-- « Maintenant » est FIXE : private.get_booking_at / cancel_booking_at / create_booking_at
-- reçoivent dimanche 18 octobre 2026, 8 h 30 à Paris (heure d'été). Rien ne dépend de la date
-- du jour, sauf la dernière partie (vraies RPC en anonyme, avec now()), qui place ses RDV par
-- rapport à now().
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

select plan(37);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, private_address, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', 'Adresse secrète un', true);

-- Dispos : de quoi poser un RDV de 60 min à chacune des dates ci-dessous (heure de Paris).
insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Passé, juste avant « maintenant » : RDV terminé.
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 06:00 Europe/Paris', '2026-10-18 07:00 Europe/Paris'),
  -- Commencé et pas fini (8 h 00 – 9 h 00).
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 08:00 Europe/Paris', '2026-10-18 09:00 Europe/Paris'),
  -- Lun. 19/10 8 h 30 : exactement 24 h après « maintenant ».
  ('20000000-0000-4000-8000-000000000001', '2026-10-19 08:30 Europe/Paris', '2026-10-19 09:30 Europe/Paris'),
  -- Mer. 21/10 8 h 30 : RDV D, testé avec « maintenant » = mar. 20/10 8 h 31 (23 h 59 avant).
  ('20000000-0000-4000-8000-000000000001', '2026-10-21 08:30 Europe/Paris', '2026-10-21 09:30 Europe/Paris'),
  -- Mar. 20 : deux RDV du même contact + un créneau pour la 3e réservation.
  ('20000000-0000-4000-8000-000000000001', '2026-10-20 10:00 Europe/Paris', '2026-10-20 13:30 Europe/Paris'),
  -- Heure d'hiver : sam. 24/10 12 h (UTC+2) → dim. 25/10 11 h (UTC+1) = 24 h réelles.
  ('20000000-0000-4000-8000-000000000001', '2026-10-25 11:00 Europe/Paris', '2026-10-25 12:00 Europe/Paris');

-- Réservations posées en tant que postgres (ends_at est recalculé par le trigger).
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone, email, cancel_token)
values
  -- A : terminé (6 h – 7 h).
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-18 06:00 Europe/Paris', now(), 'Eva', 'Petit', '0700000001', null,
   'a0000000-0000-4000-8000-00000000000a'),
  -- B : en cours (8 h – 9 h) : pas terminé, à moins de 24 h.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-18 08:00 Europe/Paris', now(), 'Tom', 'Durand', '0700000002', null,
   'b0000000-0000-4000-8000-00000000000b'),
  -- C : exactement 24 h après « maintenant ».
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-19 08:30 Europe/Paris', now(), 'Lou', 'Martin', '0700000003', 'lou@example.test',
   'c0000000-0000-4000-8000-00000000000c'),
  -- D : mer. 21/10 8 h 30, à 23 h 59 du « maintenant » mar. 20/10 8 h 31.
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-21 08:30 Europe/Paris', now(), 'Noé', 'Roux', '0700000004', null,
   'd0000000-0000-4000-8000-00000000000d'),
  -- E et F : deux RDV futurs du même téléphone (limite atteinte).
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-20 10:00 Europe/Paris', now(), 'Zoé', 'Bernard', '0600000005', null,
   'e0000000-0000-4000-8000-00000000000e'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-20 11:10 Europe/Paris', now(), 'Zoé', 'Bernard', '0600000005', null,
   'f0000000-0000-4000-8000-00000000000f');

-- Passage à l'heure d'hiver : le RDV G est le dim. 25/10 à 11 h.
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone, cancel_token)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '2026-10-25 11:00 Europe/Paris', now(), 'Ana', 'Leroy', '0700000007',
   '90000000-0000-4000-8000-000000000009');

-- ---------------------------------------------------------------------------
-- 1. Règle des 24 h, aux limites (private.*_at : « maintenant » fixe).
-- ---------------------------------------------------------------------------
select is(
  (select can_cancel from private.get_booking_at('2026-10-18 08:30 Europe/Paris', 'c0000000-0000-4000-8000-00000000000c')),
  true, '24 h pile avant le RDV : get_booking annonce « annulable »');
select is(
  (select can_cancel from private.get_booking_at('2026-10-20 08:31 Europe/Paris', 'd0000000-0000-4000-8000-00000000000d')),
  false, '23 h 59 avant le RDV : get_booking annonce « trop tard »');
select throws_ok(
  $$select private.cancel_booking_at('2026-10-20 08:31 Europe/Paris', 'd0000000-0000-4000-8000-00000000000d')$$,
  'P0001', 'too_late', '23 h 59 avant le RDV : annulation refusée (too_late)');
select is(
  (select status from public.bookings where cancel_token = 'd0000000-0000-4000-8000-00000000000d'),
  'confirmed', 'le refus n''a pas annulé le RDV');
select is(
  private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', 'c0000000-0000-4000-8000-00000000000c'),
  true, '24 h pile avant le RDV : annulation acceptée');
select throws_ok(
  $$select private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', 'b0000000-0000-4000-8000-00000000000b')$$,
  'P0001', 'too_late', 'RDV en cours (commencé, pas fini) : « trop tard », pas « lien invalide »');
select is(
  (select can_cancel from private.get_booking_at('2026-10-18 08:30 Europe/Paris', 'b0000000-0000-4000-8000-00000000000b')),
  false, 'RDV en cours : get_booking le renvoie, non annulable');

-- 24 h ABSOLUES à travers le changement d'heure : le sam. 24/10 à 12 h (UTC+2) et le dim.
-- 25/10 à 11 h (UTC+1) sont séparés de 24 h réelles, bien que l'horloge n'avance que de 23 h.
select is(
  (select can_cancel from private.get_booking_at('2026-10-24 12:00 Europe/Paris', '90000000-0000-4000-8000-000000000009')),
  true, 'passage à l''heure d''hiver : 24 h réelles avant le RDV = annulable');
select is(
  (select can_cancel from private.get_booking_at('2026-10-24 12:01 Europe/Paris', '90000000-0000-4000-8000-000000000009')),
  false, 'passage à l''heure d''hiver : 23 h 59 réelles avant = trop tard');

-- ---------------------------------------------------------------------------
-- 2. Annulation, double annulation, créneau libéré, décompte des 2 RDV.
-- ---------------------------------------------------------------------------
-- Limite : le téléphone 0600000005 a 2 RDV futurs, une 3e réservation est refusée.
select throws_ok(
  $$select * from private.create_booking_at('2026-10-18 08:30 Europe/Paris',
      '10000000-0000-4000-8000-000000000001', '2026-10-20 12:20 Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Zoé', 'Bernard', '0600000005', null, null)$$,
  'P0001', 'limit_reached', 'avant annulation : 3e RDV futur du même téléphone refusé');
-- Créneau pris : personne d'autre ne peut réserver le 20/10 à 10 h.
select throws_ok(
  $$select * from private.create_booking_at('2026-10-18 08:30 Europe/Paris',
      '10000000-0000-4000-8000-000000000001', '2026-10-20 10:00 Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Max', 'Blanc', '0600000009', null, null)$$,
  'P0001', 'slot_unavailable', 'avant annulation : le créneau est pris');

select is(
  private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', 'e0000000-0000-4000-8000-00000000000e'),
  true, 'annulation d''un RDV du 20/10, plus de 24 h avant : true');
select is(
  private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', 'e0000000-0000-4000-8000-00000000000e'),
  false, 'double annulation : false, rien ne change');
select is(
  (select status from public.bookings where cancel_token = 'e0000000-0000-4000-8000-00000000000e'),
  'cancelled', 'le RDV est bien « cancelled »');
select results_eq(
  $$select status, can_cancel from private.get_booking_at('2026-10-18 08:30 Europe/Paris', 'e0000000-0000-4000-8000-00000000000e')$$,
  $$values ('cancelled'::text, false)$$,
  'RDV annulé : get_booking renvoie « cancelled » et non annulable (« déjà annulé »)');

select is(
  (select count(*) from private.compute_slots('10000000-0000-4000-8000-000000000001',
     '2026-10-20', '2026-10-18 08:30 Europe/Paris') c
    where c.starts_at = '2026-10-20 10:00 Europe/Paris'),
  1::bigint, 'le créneau annulé réapparaît dans les créneaux libres');
select is(
  (select count(*) from private.create_booking_at('2026-10-18 08:30 Europe/Paris',
      '10000000-0000-4000-8000-000000000001', '2026-10-20 12:20 Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Zoé', 'Bernard', '0600000005', null, null)),
  1::bigint, 'après annulation : le décompte retombe à 1, la 3e réservation est acceptée');
select throws_ok(
  $$select * from private.create_booking_at('2026-10-18 08:30 Europe/Paris',
      '10000000-0000-4000-8000-000000000001', '2026-10-20 10:00 Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Zoé', 'Bernard', '0600000005', null, null)$$,
  'P0001', 'limit_reached', 'après la 3e : le décompte est de nouveau à 2, une 4e réservation est refusée');
select is(
  (select count(*) from private.create_booking_at('2026-10-18 08:30 Europe/Paris',
      '10000000-0000-4000-8000-000000000001', '2026-10-20 10:00 Europe/Paris',
      '20000000-0000-4000-8000-000000000001', 'Max', 'Blanc', '0600000009', null, null)),
  1::bigint, 'le créneau libéré peut être réservé par quelqu''un d''autre');

-- ---------------------------------------------------------------------------
-- 3. Jeton inconnu, null, lien expiré : même réponse (aucune ligne / false).
-- ---------------------------------------------------------------------------
select is_empty(
  $$select * from private.get_booking_at('2026-10-18 08:30 Europe/Paris', '49999999-0000-4000-8000-000000000000')$$,
  'jeton inconnu : get_booking ne renvoie aucune ligne');
select is_empty(
  $$select * from private.get_booking_at('2026-10-18 08:30 Europe/Paris', null)$$,
  'jeton null : get_booking ne renvoie aucune ligne');
select is(private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', '49999999-0000-4000-8000-000000000000'),
  false, 'jeton inconnu : cancel_booking renvoie false');
select is(private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', null),
  false, 'jeton null : cancel_booking renvoie false');
select is_empty(
  $$select * from private.get_booking_at('2026-10-18 08:30 Europe/Paris', 'a0000000-0000-4000-8000-00000000000a')$$,
  'RDV terminé (lien expiré) : get_booking ne renvoie aucune ligne, comme un jeton inconnu');
select is(private.cancel_booking_at('2026-10-18 08:30 Europe/Paris', 'a0000000-0000-4000-8000-00000000000a'),
  false, 'RDV terminé : cancel_booking renvoie false, comme un jeton inconnu');
select is(
  (select status from public.bookings where cancel_token = 'a0000000-0000-4000-8000-00000000000a'),
  'confirmed', 'les refus et les jetons inconnus n''ont rien annulé');
select is(
  (select count(*) from public.bookings where status = 'cancelled'),
  2::bigint, 'deux RDV annulés seulement : C (24 h pile) et E (20/10)');

-- ---------------------------------------------------------------------------
-- 4. Aucune fuite : colonnes exactes, valeurs sans adresse ni coordonnées.
-- ---------------------------------------------------------------------------
select set_eq(
  $$select a.name::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
     where n.nspname = 'public' and p.proname = 'get_booking' and a.mode = 't'$$,
  array['status', 'starts_at', 'ends_at', 'service_name', 'location_label', 'first_name',
        'can_cancel'],
  'get_booking renvoie exactement : statut, début, fin, prestation, ville, prénom, annulable');
select is(
  (select count(*) from private.get_booking_at('2026-10-20 08:31 Europe/Paris', 'd0000000-0000-4000-8000-00000000000d') g
    where to_jsonb(g)::text ~* '(secrète|0700000004|Roux|cancel_token|private_address)'),
  0::bigint, 'valeurs de get_booking : ni adresse, ni téléphone, ni email, ni nom de famille, ni jeton');
select is(
  (select pg_typeof(public.cancel_booking('49999999-0000-4000-8000-000000000000'))::text),
  'boolean', 'cancel_booking ne renvoie qu''un booléen');

-- ---------------------------------------------------------------------------
-- 5. Droits : les deux RPC pour anon seulement, aucune fonction privée exécutable.
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('anon', 'public.get_booking(uuid)', 'execute')
      and has_function_privilege('anon', 'public.cancel_booking(uuid)', 'execute'),
  'anon peut exécuter get_booking et cancel_booking');
select ok(not has_function_privilege('authenticated', 'public.get_booking(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.cancel_booking(uuid)', 'execute'),
  'authenticated ne peut exécuter ni get_booking ni cancel_booking');
select ok(
  not has_function_privilege('anon', 'private.get_booking_at(timestamptz, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.get_booking_at(timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'private.cancel_booking_at(timestamptz, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.cancel_booking_at(timestamptz, uuid)', 'execute'),
  'personne ne peut appeler les fonctions privées (ni choisir « maintenant »)');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_booking', 'cancel_booking')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  2::bigint, 'les deux RPC sont security definer avec search_path vide');

-- ---------------------------------------------------------------------------
-- 6. Les vraies RPC, en anonyme, avec now() : RDV placés par rapport à now().
-- ---------------------------------------------------------------------------
delete from public.bookings;
delete from public.availabilities;
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 2 hours');
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone, cancel_token)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        date_trunc('hour', now()) + interval '3 days', now(), 'Léa', 'Martin', '0612345678',
        '40000000-0000-4000-8000-000000000001');

set local role anon;
select results_eq(
  $$select status, location_label, first_name, can_cancel
      from public.get_booking('40000000-0000-4000-8000-000000000001')$$,
  $$values ('confirmed'::text, 'Ville un'::text, 'Léa'::text, true)$$,
  'anon : get_booking via la vraie RPC');
select is(public.cancel_booking('40000000-0000-4000-8000-000000000001'), true,
  'anon : cancel_booking via la vraie RPC');
select is(public.cancel_booking('40000000-0000-4000-8000-000000000001'), false,
  'anon : deuxième annulation via la vraie RPC : false');
reset role;

select * from finish();
rollback;
