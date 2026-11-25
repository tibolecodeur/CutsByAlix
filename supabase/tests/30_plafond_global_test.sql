-- Plafond global de réservations (K-02, ADR 0014) : au plus 6 réservations créées par heure et
-- 20 par 24 h, sur tout le site, annulées comprises ; au-delà, `rate_limited`. Le rejeu d'une
-- réservation (même clé, ADR 0009) ne compte pas une seconde fois.
-- « Maintenant » est FIXE et passé à private.create_booking_at : rien ne dépend de la date du
-- jour. Chaque réservation a son propre téléphone (la limite de 2 RDV par contact ne joue pas).
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

select plan(13);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true);

-- Grandes dispos de 8 h à 23 h 50 du 1er au 21 juin 2030 : 13 créneaux de 70 min par jour.
-- « Maintenant » : 31 mai 2030 (créneaux à plus de 2 h et à moins de 4 semaines).
insert into public.availabilities (location_id, starts_at, ends_at)
select '20000000-0000-4000-8000-000000000001',
       (g.d::date + time '08:00') at time zone 'Europe/Paris',
       (g.d::date + time '23:10') at time zone 'Europe/Paris'
  -- ::date : generate_series renvoie un timestamptz, qu'il ne faut pas reconvertir de fuseau.
  from generate_series(date '2030-06-01', date '2030-06-21', interval '1 day') g (d);

-- Réserve le n-ième créneau (0 = 1er juin 8 h, 13 créneaux par jour) à l'heure p_now, avec
-- un téléphone propre à n. Renvoie le jeton.
create function pg_temp.book(p_now timestamptz, n integer, p_request uuid default null)
returns uuid
language sql as $$
  select cancel_token from private.create_booking_at(
    p_now, '10000000-0000-4000-8000-000000000001',
    ((date '2030-06-01' + (n / 13)) + time '08:00') at time zone 'Europe/Paris'
      + (n % 13) * interval '70 minutes',
    '20000000-0000-4000-8000-000000000001', 'Léa', 'Martin',
    '07' || lpad(n::text, 8, '0'), null, null, p_request);
$$;

-- ---------------------------------------------------------------------------
-- 1. Réglages.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select max_bookings_per_hour, max_bookings_per_day from private.settings()$$,
  $$values (6, 20)$$,
  'private.settings() : 6 réservations par heure, 20 par 24 h');

-- ---------------------------------------------------------------------------
-- 2. Plafond horaire : 6 acceptées dans l'heure, la 7e refusée.
-- ---------------------------------------------------------------------------
select lives_ok($$
  select pg_temp.book('2030-05-31 10:00 Europe/Paris'::timestamptz + n * interval '5 minutes', n)
    from generate_series(0, 5) n
$$, '6 réservations en 25 min : acceptées');
select throws_ok(
  $$select pg_temp.book('2030-05-31 10:30 Europe/Paris', 6)$$,
  'P0001', 'rate_limited', '7e réservation dans l''heure : refusée (rate_limited)');
select is((select count(*) from public.bookings), 6::bigint, 'le refus n''a rien enregistré');

-- Annuler ne libère pas le plafond (sinon une boucle réserver / annuler le contournerait).
update public.bookings set status = 'cancelled', cancelled_by = 'client'
 where phone = '0700000000';
select throws_ok(
  $$select pg_temp.book('2030-05-31 10:30 Europe/Paris', 6)$$,
  'P0001', 'rate_limited', 'une annulation ne libère pas le plafond horaire');

-- Une heure après la 1re (10 h 00), elle sort de la fenêtre : une place se libère.
select lives_ok($$select pg_temp.book('2030-05-31 11:00:01 Europe/Paris', 6)$$,
  'plus d''une heure après la 1re : de nouveau acceptée');
select throws_ok(
  $$select pg_temp.book('2030-05-31 11:00:02 Europe/Paris', 7)$$,
  'P0001', 'rate_limited', 'et la suivante, dans la même heure glissante, refusée');

-- Alix annule de fausses réservations depuis l'admin : elles ne comptent plus, le plafond
-- se libère aussitôt (sinon un script pourrait bloquer les vrais clients pendant 24 h).
update public.bookings set status = 'cancelled', cancelled_by = 'barber'
 where phone in ('0700000001', '0700000002');
select lives_ok($$
  select pg_temp.book('2030-05-31 11:00:03 Europe/Paris', 7),
         pg_temp.book('2030-05-31 11:00:04 Europe/Paris', 8)
$$, '2 réservations annulées par Alix : hors plafond, 2 nouvelles acceptées');
select throws_ok(
  $$select pg_temp.book('2030-05-31 11:00:05 Europe/Paris', 9)$$,
  'P0001', 'rate_limited', 'et pas une de plus');

-- ---------------------------------------------------------------------------
-- 3. Rejeu : la même réservation renvoyée (même clé) ne compte pas une 2e fois et n'est pas
--    bloquée par le plafond qu'elle a elle-même contribué à remplir.
-- ---------------------------------------------------------------------------
truncate public.bookings;
select lives_ok($$
  select pg_temp.book('2030-05-31 10:00 Europe/Paris'::timestamptz + n * interval '1 minute', n,
                      case when n = 5 then 'a0000000-0000-4000-8000-000000000005'::uuid end)
    from generate_series(0, 5) n
$$, '6 réservations, la dernière avec une clé de rejeu');
select is(
  pg_temp.book('2030-05-31 10:10 Europe/Paris', 5, 'a0000000-0000-4000-8000-000000000005'),
  (select cancel_token from public.bookings where phone = '0700000005'),
  'rejeu de la 6e, plafond atteint : même réservation renvoyée');
select is((select count(*) from public.bookings), 6::bigint, 'le rejeu n''a rien créé');

-- ---------------------------------------------------------------------------
-- 4. Plafond sur 24 h : 20 réservations étalées (6 par heure au plus), la 21e refusée.
-- ---------------------------------------------------------------------------
truncate public.bookings;
-- Une toutes les 15 min : 4 par heure, sous le plafond horaire.
select pg_temp.book('2030-05-31 08:00 Europe/Paris'::timestamptz + n * interval '15 minutes', n)
  from generate_series(0, 19) n;
select throws_ok(
  $$select pg_temp.book('2030-05-31 13:15 Europe/Paris', 20)$$,
  'P0001', 'rate_limited', '21e réservation en 24 h (4 dans l''heure) : refusée');

select * from finish();
rollback;
