-- get_booking et cancel_booking : tout passe par le cancel_token, rien ne fuit sans lui.
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

select plan(15);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

insert into public.services (id, name, duration_min) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60);
insert into public.locations (id, public_label, private_address) values
  ('20000000-0000-4000-8000-000000000001', 'Lieu un', 'Adresse secrète 42');

insert into public.availabilities (location_id, starts_at, ends_at) values
  -- RDV passé.
  ('20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) - interval '5 hours', date_trunc('hour', now()) - interval '3 hours'),
  -- RDV dans l'heure qui vient : trop tard pour annuler.
  ('20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '3 hours'),
  -- RDV dans 3 jours : annulable.
  ('20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 4 hours');

insert into public.bookings (service_id, location_id, starts_at, ends_at, first_name, last_name, phone, email, cancel_token)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '3 days', now(), 'Léa', 'Martin', '0612345678',
   'lea@example.test', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) + interval '1 hour', now(), 'Tom', 'Durand', '0698765432',
   null, '40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   date_trunc('hour', now()) - interval '5 hours', now(), 'Eva', 'Petit', '0700000001',
   null, '40000000-0000-4000-8000-000000000003');

set local role anon;

-- ---------------------------------------------------------------------------
-- Mauvais token : rien ne fuit, rien n'est annulé.
-- ---------------------------------------------------------------------------
select is_empty(
  $$select * from public.get_booking('49999999-0000-4000-8000-000000000000')$$,
  'get_booking avec un mauvais token : aucune ligne');
select is_empty(
  $$select * from public.get_booking(null)$$,
  'get_booking sans token : aucune ligne');
select is(public.cancel_booking('49999999-0000-4000-8000-000000000000'), false,
  'cancel_booking avec un mauvais token : false');
select is(public.cancel_booking(null), false,
  'cancel_booking sans token : false');

reset role;
select is((select count(*) from public.bookings where status = 'cancelled'), 0::bigint,
  'après les mauvais tokens, aucune réservation n''a été annulée');
set local role anon;

-- ---------------------------------------------------------------------------
-- Bon token.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select status, location_label, first_name, can_cancel
      from public.get_booking('40000000-0000-4000-8000-000000000001')$$,
  $$values ('confirmed'::text, 'Lieu un'::text, 'Léa'::text, true)$$,
  'get_booking avec le bon token : statut, lieu public, prénom, annulable');
select is(
  (select count(*) from public.get_booking('40000000-0000-4000-8000-000000000001') g
    where to_jsonb(g) ?| array['private_address', 'phone', 'email', 'last_name', 'id',
                               'cancel_token']
       or to_jsonb(g)::text like '%secrète%'),
  0::bigint,
  'get_booking ne renvoie ni adresse privée, ni téléphone, ni email, ni nom, ni identifiant');

-- Moins de 24 h avant : refus.
select throws_ok(
  $$select public.cancel_booking('40000000-0000-4000-8000-000000000002')$$,
  'P0001', 'too_late',
  'annulation à moins de 24 h refusée');
select is(
  (select can_cancel from public.get_booking('40000000-0000-4000-8000-000000000002')),
  false,
  'get_booking indique qu''il est trop tard pour annuler');

-- RDV passé : refus.
select throws_ok(
  $$select public.cancel_booking('40000000-0000-4000-8000-000000000003')$$,
  'P0001', 'too_late',
  'annulation d''un RDV passé refusée');
select is(
  (select can_cancel from public.get_booking('40000000-0000-4000-8000-000000000003')),
  false,
  'RDV terminé : plus annulable');

-- Annulation nominale.
select is(public.cancel_booking('40000000-0000-4000-8000-000000000001'), true,
  'annulation avec le bon token, plus de 24 h avant : true');
select is(public.cancel_booking('40000000-0000-4000-8000-000000000001'), false,
  'deuxième annulation : false (déjà annulé)');
select results_eq(
  $$select status, can_cancel from public.get_booking('40000000-0000-4000-8000-000000000001')$$,
  $$values ('cancelled'::text, false)$$,
  'RDV annulé : statut cancelled, plus annulable');

reset role;
select is(
  (select status from public.bookings where cancel_token = '40000000-0000-4000-8000-000000000002'),
  'confirmed',
  'le RDV à moins de 24 h est toujours confirmé');

select * from finish();
rollback;
