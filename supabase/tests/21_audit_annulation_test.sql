-- Audit (consigne 23, docs/AUDIT-2026-10.md §A) : annulation, cas non couverts par 06 et 11 :
-- l'id d'un RDV n'est pas un jeton, jeton NULL, RDV annulé par Alix, RDV réservé à moins de
-- 24 h (jamais annulable en ligne), RDV déjà passé, jeton réutilisé après annulation.
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

select plan(14);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min, active) values
  ('1a000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, private_address, active) values
  ('2a000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse factice', true);
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('2a000000-0000-4000-8000-000000000001', '2030-05-30 10:00 Europe/Paris', '2030-05-30 12:00 Europe/Paris'),
  ('2a000000-0000-4000-8000-000000000001', '2030-06-01 14:00 Europe/Paris', '2030-06-01 16:00 Europe/Paris'),
  ('2a000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris', '2030-06-12 18:00 Europe/Paris');

-- Jetons et ids FIXES (factices) pour lire facilement les cas.
insert into public.bookings (id, service_id, location_id, starts_at, first_name, last_name, phone, cancel_token, status, cancelled_by) values
  -- P : déjà passé (avant-hier).
  ('5a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
   '2030-05-30 10:00 Europe/Paris', 'Pa', 'Ssé', '0600000101', 'ca000000-0000-4000-8000-000000000001', 'confirmed', null),
  -- S : aujourd'hui 14 h, réservé à moins de 24 h (5 h 30 avant).
  ('5a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
   '2030-06-01 14:00 Europe/Paris', 'Bien', 'Tôt', '0600000102', 'ca000000-0000-4000-8000-000000000002', 'confirmed', null),
  -- F : dans 11 jours, confirmé.
  ('5a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
   '2030-06-12 10:00 Europe/Paris', 'Fu', 'Tur', '0600000103', 'ca000000-0000-4000-8000-000000000003', 'confirmed', null),
  -- B : dans 11 jours, annulé par Alix.
  ('5a000000-0000-4000-8000-000000000004', '1a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001',
   '2030-06-12 11:10 Europe/Paris', 'Bar', 'Ber', '0600000104', 'ca000000-0000-4000-8000-000000000004', 'cancelled', 'barber');

create function pg_temp.cancel(p_token uuid) returns boolean
language sql as $$ select private.cancel_booking_at('2030-06-01 08:30 Europe/Paris', p_token) $$;
create function pg_temp.get(p_token uuid) returns setof record
language sql as $$ select * from private.get_booking_at('2030-06-01 08:30 Europe/Paris', p_token) $$;

-- 1. Jetons invalides : NULL, inconnu, et l'ID du RDV (jamais accepté comme jeton).
select is(pg_temp.cancel(null), false, 'jeton NULL : false, sans erreur');
select is(pg_temp.cancel('ca000000-0000-4000-8000-0000000000ff'), false, 'jeton inconnu : false');
select is(pg_temp.cancel('5a000000-0000-4000-8000-000000000003'), false,
  'l''id du RDV utilisé comme jeton : false (seul cancel_token compte)');
select is((select status from public.bookings where id = '5a000000-0000-4000-8000-000000000003'),
  'confirmed', '… et le RDV n''a pas bougé');

-- 2. « Jeton expiré » = RDV terminé : se comporte comme un lien inconnu (aucune fuite).
select is(pg_temp.cancel('ca000000-0000-4000-8000-000000000001'), false, 'RDV passé : false');
select is((select count(*) from pg_temp.get('ca000000-0000-4000-8000-000000000001')
             as t(status text, s timestamptz, e timestamptz, n text, l text, f text, c boolean, b text)),
  0::bigint, 'RDV passé : get_booking ne renvoie rien (comme un lien inconnu)');

-- 3. RDV réservé à moins de 24 h : jamais annulable en ligne.
select is((select c from pg_temp.get('ca000000-0000-4000-8000-000000000002')
             as t(status text, s timestamptz, e timestamptz, n text, l text, f text, c boolean, b text)),
  false, 'RDV dans 5 h 30 : can_cancel = false');
select throws_ok($$select pg_temp.cancel('ca000000-0000-4000-8000-000000000002')$$,
  'P0001', 'too_late', 'RDV dans 5 h 30 : annulation refusée (too_late)');

-- 4. Jeton déjà utilisé : la 2e annulation ne fait rien et ne change pas cancelled_by.
select is(pg_temp.cancel('ca000000-0000-4000-8000-000000000003'), true, 'RDV futur : annulé');
select is(pg_temp.cancel('ca000000-0000-4000-8000-000000000003'), false, 'même jeton réutilisé : false');
select is((select cancelled_by from public.bookings where id = '5a000000-0000-4000-8000-000000000003'),
  'client', 'cancelled_by reste « client »');

-- 5. RDV annulé par Alix : le client ne peut pas « l'annuler » à nouveau, et l'apprend.
select is(pg_temp.cancel('ca000000-0000-4000-8000-000000000004'), false,
  'RDV annulé par Alix : false');
select is((select b from pg_temp.get('ca000000-0000-4000-8000-000000000004')
             as t(status text, s timestamptz, e timestamptz, n text, l text, f text, c boolean, b text)),
  'barber', 'get_booking indique « annulé par Alix »');

-- 6. Le get_booking d'un jeton ne renvoie jamais téléphone, e-mail, nom ni adresse.
select is_empty(
  $$select 1 from pg_temp.get('ca000000-0000-4000-8000-000000000003')
      as t(status text, s timestamptz, e timestamptz, n text, l text, f text, c boolean, b text)
     where t::text ~ '0600000103|Tur|Adresse'$$,
  'get_booking : ni téléphone, ni nom de famille, ni adresse');

select * from finish();
rollback;
