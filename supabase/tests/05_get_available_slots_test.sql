-- Calcul des créneaux libres.
-- La plupart des cas passent par private.compute_slots avec une date « maintenant » FIXE
-- (dimanche 18 octobre 2026, 8 h 30 à Paris) : le test ne se périme pas avec le temps.
-- Règles (private.settings) : grille au pas de 70 min, au moins 5 h à l'avance, 4 semaines max.
-- Les deux derniers vérifient get_available_slots (la vraie RPC, avec now()) en anonyme.
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

select plan(14);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true),
  ('10000000-0000-4000-8000-000000000002', 'Prestation masquée', 60, false),
  ('10000000-0000-4000-8000-000000000003', 'Coupe longue', 90, true);
insert into public.locations (id, public_label, private_address, active) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse un', true),
  ('20000000-0000-4000-8000-000000000002', 'Lieu deux', 'Adresse deux', true),
  ('20000000-0000-4000-8000-000000000003', 'Lieu fermé', 'Adresse trois', false);

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- Dim. 18/10 12 h – 16 h, grille 12:00, 13:10, 14:20 : 12:00 et 13:10 sont à moins de 5 h (limite 18/10
  -- 13 h 30) → seul 14:20 reste. (15:30 finirait à 16:30, hors dispo.)
  ('20000000-0000-4000-8000-000000000001', '2026-10-18 12:00 Europe/Paris', '2026-10-18 16:00 Europe/Paris'),
  -- Mer. 21/10 14 h – 18 h, lieu deux, grille 14:00, 15:10, 16:20 : un RDV à 15 h 10.
  ('20000000-0000-4000-8000-000000000002', '2026-10-21 14:00 Europe/Paris', '2026-10-21 18:00 Europe/Paris'),
  -- Jeu. 22/10 10 h – 13 h : pour la prestation de 90 min (10:00, 11:10 ; 12:20 déborde).
  ('20000000-0000-4000-8000-000000000001', '2026-10-22 10:00 Europe/Paris', '2026-10-22 13:00 Europe/Paris'),
  -- Ven. 23/10 10 h – 12 h, lieu inactif.
  ('20000000-0000-4000-8000-000000000003', '2026-10-23 10:00 Europe/Paris', '2026-10-23 12:00 Europe/Paris'),
  -- Dim. 25/10, jour du passage à l'heure d'hiver (3 h → 2 h) : journée de 25 h.
  ('20000000-0000-4000-8000-000000000001', '2026-10-25 09:00 Europe/Paris', '2026-10-25 12:00 Europe/Paris'),
  ('20000000-0000-4000-8000-000000000001', '2026-10-25 23:00 Europe/Paris', '2026-10-26 00:00 Europe/Paris'),
  -- Dim. 15/11 8 h – 11 h : limite des 4 semaines (15/11 8 h 30) → 8:00 oui, 9:10 non.
  ('20000000-0000-4000-8000-000000000001', '2026-11-15 08:00 Europe/Paris', '2026-11-15 11:00 Europe/Paris');

insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
        '2026-10-21 15:10 Europe/Paris', '2026-10-21 16:10 Europe/Paris', 'Léa', 'Martin', '0612345678');

-- Raccourci de lecture : heures locales des créneaux d'un jour, pour une prestation.
-- (Fonction temporaire, appelée seulement en tant que postgres.)
create function pg_temp.slots(p_service uuid, p_day date) returns text[]
language sql as $$
  select coalesce(array_agg(to_char(c.starts_at at time zone 'Europe/Paris', 'HH24:MI')
                            order by c.starts_at), '{}')
    from private.compute_slots(p_service, p_day, '2026-10-18 08:30 Europe/Paris') c;
$$;

-- ---------------------------------------------------------------------------
select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-18'),
  array['14:20'],
  'ni créneau passé, ni créneau à moins de 5 h');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-21'),
  array['14:00', '16:20'],
  'un créneau déjà réservé n''est pas proposé');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000003', '2026-10-22'),
  array['10:00', '11:10'],
  'grille de 70 min depuis le début de la dispo, créneau entièrement dans la dispo (90 min)');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-23'),
  '{}'::text[],
  'aucun créneau dans un lieu inactif');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000002', '2026-10-21'),
  '{}'::text[],
  'prestation inactive : aucun créneau');

select is(pg_temp.slots('99999999-0000-4000-8000-000000000000', '2026-10-21'),
  '{}'::text[],
  'prestation inconnue : aucun créneau');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-11-15'),
  array['08:00'],
  'rien au-delà de 4 semaines');

-- ---------------------------------------------------------------------------
-- Changement d'heure (dimanche 25 octobre 2026).
-- ---------------------------------------------------------------------------
select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-25'),
  array['09:00', '10:10', '23:00'],
  'heure d''hiver : ni créneau doublé ni créneau perdu, 23 h compte bien pour le 25');

select is(
  (select min(c.starts_at) from private.compute_slots(
     '10000000-0000-4000-8000-000000000001', '2026-10-25', '2026-10-18 08:30 Europe/Paris') c),
  '2026-10-25 08:00:00+00'::timestamptz,
  'heure d''hiver : 9 h à Paris le 25/10 = 8 h UTC (UTC+1)');

select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-26'),
  '{}'::text[],
  'heure d''hiver : le créneau de 23 h le 25 n''apparaît pas le 26');

-- ---------------------------------------------------------------------------
-- Un RDV d'un autre lieu bloque aussi le créneau (le barber n'est qu'à un endroit).
-- Situation impossible en temps normal (dispos sans chevauchement) : on la force sans trigger.
-- ---------------------------------------------------------------------------
alter table public.bookings disable trigger bookings_before_write;
insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        '2026-10-21 17:00 Europe/Paris', '2026-10-21 18:00 Europe/Paris', 'Tom', 'Durand', '0698765432');
alter table public.bookings enable trigger bookings_before_write;

select is(pg_temp.slots('10000000-0000-4000-8000-000000000001', '2026-10-21'),
  array['14:00'],
  'un créneau réservé dans un autre lieu n''est pas proposé (17 h bloque 16 h 20)');

-- ---------------------------------------------------------------------------
-- La vraie RPC, en anonyme, avec l'heure réelle.
-- ---------------------------------------------------------------------------
-- On repart de zéro : les dispos ci-dessous dépendent de now(). Si les dispos à dates fixes
-- restaient en base, J+10 tomberait certains jours sur l'une d'elles (contrainte
-- d'exclusion, test cassé selon la date du jour).
delete from public.bookings;
delete from public.availabilities;

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- De 1 h à 9 h après maintenant (heure pile) : le début est à moins de 5 h, la fin non.
  ('20000000-0000-4000-8000-000000000002',
   date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '9 hours'),
  -- Dans 10 jours, 10 h – 12 h 20 : 10:00 et 11:10.
  ('20000000-0000-4000-8000-000000000001',
   ((now() at time zone 'Europe/Paris')::date + 10 + time '10:00') at time zone 'Europe/Paris',
   ((now() at time zone 'Europe/Paris')::date + 10 + time '12:20') at time zone 'Europe/Paris');

set local role anon;

-- Créneaux de la plage 1 h – 9 h, sur les jours qu'elle peut toucher (J à J+3).
select is(
  (select count(*) from (select s.*
     from generate_series(0, 3) as d
    cross join lateral public.get_available_slots('10000000-0000-4000-8000-000000000001',
                                                  (now() at time zone 'Europe/Paris')::date + d) s
    where s.location_label = 'Lieu deux') near where near.starts_at < now() + interval '5 hours'),
  0::bigint,
  'get_available_slots ne renvoie aucun créneau à moins de 5 h');
select ok(
  (select count(*) from (select s.*
     from generate_series(0, 3) as d
    cross join lateral public.get_available_slots('10000000-0000-4000-8000-000000000001',
                                                  (now() at time zone 'Europe/Paris')::date + d) s
    where s.location_label = 'Lieu deux') near) > 0,
  'get_available_slots renvoie bien les créneaux de la même plage situés après 5 h');

select results_eq(
  $$select to_char(starts_at at time zone 'Europe/Paris', 'HH24:MI'), location_label
      from public.get_available_slots('10000000-0000-4000-8000-000000000001',
                                      (now() at time zone 'Europe/Paris')::date + 10)$$,
  $$values ('10:00', 'Lieu un'), ('11:10', 'Lieu un')$$,
  'get_available_slots renvoie en un appel les créneaux et le libellé public du lieu');

select * from finish();
rollback;
