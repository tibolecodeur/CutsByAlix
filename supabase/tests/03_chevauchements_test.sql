-- Intégrité du planning : pas de double réservation (tous lieux confondus), pas de dispos qui
-- se chevauchent, RDV entièrement dans une dispo du même lieu, dispos protégées.
-- Ces règles sont dans la base : elles s'appliquent même à une écriture directe (admin).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60);
insert into public.locations (id, public_label, private_address) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse un'),
  ('20000000-0000-4000-8000-000000000002', 'Lieu deux', 'Adresse deux');

-- Dispo A1 : J+2, 10 h – 14 h, lieu un.
insert into public.availabilities (id, location_id, starts_at, ends_at) values (
  '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
  ((now() at time zone 'Europe/Paris')::date + 2 + time '10:00') at time zone 'Europe/Paris',
  ((now() at time zone 'Europe/Paris')::date + 2 + time '14:00') at time zone 'Europe/Paris');

-- ---------------------------------------------------------------------------
-- Disponibilités
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.availabilities (location_id, starts_at, ends_at) values (
      '20000000-0000-4000-8000-000000000002',
      ((now() at time zone 'Europe/Paris')::date + 2 + time '14:00') at time zone 'Europe/Paris',
      ((now() at time zone 'Europe/Paris')::date + 2 + time '18:00') at time zone 'Europe/Paris')$$,
  'deux dispos qui se touchent (14 h) sans se chevaucher sont acceptées');

select throws_ok(
  $$insert into public.availabilities (location_id, starts_at, ends_at) values (
      '20000000-0000-4000-8000-000000000002',
      ((now() at time zone 'Europe/Paris')::date + 2 + time '13:00') at time zone 'Europe/Paris',
      ((now() at time zone 'Europe/Paris')::date + 2 + time '15:00') at time zone 'Europe/Paris')$$,
  '23P01', null,
  'deux dispos qui se chevauchent sont refusées, même dans deux lieux différents');

-- ---------------------------------------------------------------------------
-- Réservations
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('60000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '10:00') at time zone 'Europe/Paris',
            now(), 'Léa', 'Martin', '0612345678')$$,
  'une réservation dans la dispo du même lieu est acceptée');

select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '10:30') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', '0698765432')$$,
  '23P01', null,
  'double réservation (créneaux qui se chevauchent) refusée');

select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '11:00') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', '0698765432')$$,
  'P0001', 'outside_availability',
  'réservation dans un lieu différent de celui de la plage refusée');

select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '13:30') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', '0698765432')$$,
  'P0001', 'outside_availability',
  'réservation qui déborde de la dispo (13 h 30 – 14 h 30) refusée');

-- Même sans le trigger (qui empêche déjà un RDV hors de sa dispo), la contrainte d'exclusion
-- à elle seule interdit deux RDV au même moment dans deux lieux différents.
alter table public.bookings disable trigger bookings_before_write;
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '10:00') at time zone 'Europe/Paris',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '11:00') at time zone 'Europe/Paris',
            'Tom', 'Durand', '0698765432')$$,
  '23P01', null,
  'double réservation sur deux lieux différents au même moment refusée');
alter table public.bookings enable trigger bookings_before_write;

select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '12:00') at time zone 'Europe/Paris',
            now(), 'Sans', 'Contact')$$,
  '23514', null,
  'réservation sans téléphone ni email refusée');

-- ends_at est calculé par la base (starts_at + durée), quoi que l'appelant envoie.
insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, email)
values ('60000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
        ((now() at time zone 'Europe/Paris')::date + 2 + time '12:00') at time zone 'Europe/Paris',
        '2000-01-01 00:00+00', 'Eva', 'Petit', 'eva@example.test');
select is(
  (select ends_at - starts_at from public.bookings where id = '60000000-0000-4000-8000-000000000002'),
  interval '60 minutes',
  'ends_at est recalculé à partir de la durée de la prestation');

update public.bookings set ends_at = ends_at + interval '3 hours'
 where id = '60000000-0000-4000-8000-000000000002';
select is(
  (select ends_at - starts_at from public.bookings where id = '60000000-0000-4000-8000-000000000002'),
  interval '60 minutes',
  'ends_at ne peut pas être modifié à la main');

-- Une réservation annulée libère le créneau.
select lives_ok(
  $$update public.bookings set status = 'cancelled', cancelled_by = 'client'
     where id = '60000000-0000-4000-8000-000000000001'$$,
  'annulation d''une réservation');
select lives_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
            ((now() at time zone 'Europe/Paris')::date + 2 + time '10:00') at time zone 'Europe/Paris',
            now(), 'Tom', 'Durand', '0698765432')$$,
  'le créneau d''un RDV annulé est de nouveau réservable');

-- ---------------------------------------------------------------------------
-- Dispo protégée tant qu'elle contient des RDV futurs confirmés.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$delete from public.availabilities where id = '50000000-0000-4000-8000-000000000001'$$,
  'P0001', 'availability_has_bookings',
  'suppression d''une dispo contenant des RDV futurs refusée');

select throws_ok(
  $$update public.availabilities
       set ends_at = ((now() at time zone 'Europe/Paris')::date + 2 + time '10:30') at time zone 'Europe/Paris'
     where id = '50000000-0000-4000-8000-000000000001'$$,
  'P0001', 'availability_has_bookings',
  'raccourcir une dispo au point d''exclure un RDV est refusé');

select throws_ok(
  $$update public.availabilities set location_id = '20000000-0000-4000-8000-000000000002'
     where id = '50000000-0000-4000-8000-000000000001'$$,
  'P0001', 'availability_has_bookings',
  'changer le lieu d''une dispo contenant des RDV est refusé');

select lives_ok(
  $$update public.availabilities
       set starts_at = ((now() at time zone 'Europe/Paris')::date + 2 + time '09:00') at time zone 'Europe/Paris'
     where id = '50000000-0000-4000-8000-000000000001'$$,
  'agrandir une dispo contenant des RDV reste possible');

insert into public.availabilities (id, location_id, starts_at, ends_at) values (
  '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
  ((now() at time zone 'Europe/Paris')::date + 4 + time '10:00') at time zone 'Europe/Paris',
  ((now() at time zone 'Europe/Paris')::date + 4 + time '12:00') at time zone 'Europe/Paris');
select lives_ok(
  $$delete from public.availabilities where id = '50000000-0000-4000-8000-000000000003'$$,
  'une dispo sans RDV se supprime');

select * from finish();
rollback;
