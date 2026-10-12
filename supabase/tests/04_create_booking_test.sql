-- create_booking, appelée comme le ferait le site : par un visiteur anonyme.
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

select plan(32);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('10000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false);
insert into public.locations (id, public_label) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un'),
  ('20000000-0000-4000-8000-000000000002', 'Lieu deux');

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Dans l'heure qui vient : bien en deçà du délai minimum de 48 h.
  ('20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '2 hours'),
  -- J+3 (toujours à plus de 48 h), 10 h – 18 h, lieu un. Prestation de 60 min, grille au pas
  -- de 70 min : 10:00, 11:10, 12:20, 13:30, 14:40, 15:50, 17:00.
  ('20000000-0000-4000-8000-000000000001',
   ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
   ((now() at time zone 'Europe/Paris')::date + 3 + time '18:00') at time zone 'Europe/Paris'),
  -- Dans 30 jours : au-delà de l'horizon de 4 semaines.
  ('20000000-0000-4000-8000-000000000002',
   date_trunc('hour', now()) + interval '30 days', date_trunc('hour', now()) + interval '30 days 2 hours');

set local role anon;

-- ---------------------------------------------------------------------------
-- Cas nominal : le récap contient le lieu (déduit de la dispo), l'adresse et le token.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select location_label, ends_at - starts_at, cancel_token is not null
      from public.create_booking(
        '10000000-0000-4000-8000-000000000001',
        ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris',
        '20000000-0000-4000-8000-000000000001',
        '  Léa ', 'Martin', '06 12 34 56 78', null, null)$$,
  $$values ('Lieu un'::text, interval '60 minutes', true)$$,
  'réservation nominale : récap avec lieu, durée et token (sans adresse privée)');

-- ---------------------------------------------------------------------------
-- Refus
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '10:00') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432')$$,
  'P0001', 'slot_unavailable', 'créneau déjà réservé refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '19:00') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432')$$,
  'P0001', 'slot_unavailable', 'réservation hors disponibilité refusée');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '10:30') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432')$$,
  'P0001', 'slot_unavailable', 'réservation hors de la grille de 70 min (10 h 30) refusée');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      date_trunc('hour', now()) + interval '1 hour', '20000000-0000-4000-8000-000000000001', 'Tom', 'Durand', '0698765432')$$,
  'P0001', 'too_soon', 'réservation à moins de 48 h refusée');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      date_trunc('hour', now()) + interval '30 days', '20000000-0000-4000-8000-000000000001', 'Tom', 'Durand', '0698765432')$$,
  'P0001', 'too_far', 'réservation à plus de 4 semaines refusée');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Robot', 'Spam', '0611111111', null, 'https://spam.example')$$,
  'P0001', 'invalid_input', 'honeypot rempli : refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', null, null)$$,
  'P0001', 'invalid_input', 'ni téléphone ni email : refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', null, 'pas-un-email')$$,
  'P0001', 'invalid_input', 'email invalide : refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      '', 'Durand', '0698765432')$$,
  'P0001', 'invalid_input', 'prénom vide : refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      '<img src=x onerror=alert(1)>', 'Durand', '0698765432')$$,
  'P0001', 'invalid_input', 'prénom contenant du HTML : refusé');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '+06 98 76 54 32')$$,
  'P0001', 'invalid_input', 'téléphone mal formé (+06…) : refusé, pas de contournement de la limite');

select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000002',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '0698765432')$$,
  'P0001', 'invalid_input', 'prestation inactive : refusée');

-- ---------------------------------------------------------------------------
-- Anti-abus : 2 RDV futurs max par téléphone (même écrit autrement) ou par email.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '11:10') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Léa', 'Martin', '+33 6 12 34 56 78')$$,
  '2e RDV futur avec le même téléphone : accepté');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Léa', 'Martin', '06.12.34.56.78')$$,
  'P0001', 'limit_reached', '3e RDV futur avec le même téléphone : refusé');

select lives_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '13:30') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Zoé', 'Bernard', null, 'zoe@example.test')$$,
  '1er RDV avec un email : accepté');
select lives_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '14:40') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Zoé', 'Bernard', '0700000001', 'zoe@example.test')$$,
  '2e RDV avec le même email : accepté');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Zoé', 'Bernard', '0700000002', '  ZOE@Example.TEST ')$$,
  'P0001', 'limit_reached', '3e RDV futur avec le même email (casse différente) : refusé');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Zoé', 'Bernard', '0700000003', 'zoe+alias@example.test')$$,
  'P0001', 'limit_reached', '3e RDV futur avec un alias « +… » du même email : refusé');

-- ---------------------------------------------------------------------------
-- Caractères invisibles et normalisation du téléphone. Les caractères spéciaux sont écrits
-- en échappements U&'\XXXX' : jamais de caractère invisible littéral dans ce fichier.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      U&'To\202Em', 'Durand', '0698765432')$$,
  'P0001', 'invalid_input', 'prénom avec inversion de sens (U+202E) : refusé');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', U&'Du\200Brand', '0698765432')$$,
  'P0001', 'invalid_input', 'nom avec caractère invisible (U+200B) : refusé');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', null, U&'zoe\200B@example.test')$$,
  'P0001', 'invalid_input', 'email avec caractère invisible : refusé (pas de contournement de la limite)');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', null, U&'tom\202Etxt.exe@example.test')$$,
  'P0001', 'invalid_input', 'email avec inversion de sens (U+202E) : refusé');
select throws_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Tom', 'Durand', '+33 06 98 76 54 32')$$,
  'P0001', 'invalid_input', 'téléphone « +33 0… » : refusé');
select lives_ok(
  $$select * from public.create_booking('10000000-0000-4000-8000-000000000001',
      ((now() at time zone 'Europe/Paris')::date + 3 + time '12:20') at time zone 'Europe/Paris', '20000000-0000-4000-8000-000000000001',
      'Ugo', 'Moreau', '0033 7 11 22 33 44')$$,
  'téléphone « 0033 7… » : accepté');

-- ---------------------------------------------------------------------------
-- Vérifications en base (en tant que postgres).
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select phone from public.bookings where first_name = 'Ugo'),
  '0711223344',
  '« 0033 7 11 22 33 44 » est stocké « 0711223344 »');

-- Les contraintes de la table protègent aussi les écritures directes (admin).
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', '+33698765432')$$,
  '23514', null, 'écriture directe : téléphone non normalisé (+33…) refusé par la table');
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, email)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', U&'tom\202Etxt.exe@example.test')$$,
  '23514', null, 'écriture directe : email avec inversion de sens refusé par la table');
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 3 + time '15:50') at time zone 'Europe/Paris',
            now(), U&'To\FEFFm', 'Durand', '0698765432')$$,
  '23514', null, 'écriture directe : prénom avec caractère invisible (U+FEFF) refusé par la table');

select is(
  (select phone from public.bookings where first_name = 'Léa' order by starts_at limit 1),
  '0612345678',
  'le téléphone est stocké normalisé');
select is(
  (select first_name from public.bookings order by starts_at limit 1),
  'Léa',
  'le prénom est stocké sans espaces superflus');
select is(
  (select count(*) from public.bookings),
  5::bigint,
  'seules les 5 réservations valides ont été enregistrées');

select * from finish();
rollback;
