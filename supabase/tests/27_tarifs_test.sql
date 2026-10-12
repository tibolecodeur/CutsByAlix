-- Tarifs, durées et fin des rendez-vous (consigne 26).
-- Coupe : 60 min / 10 €. Coupe + barbe : 70 min / 12 €. Les créneaux restent de 70 min pour
-- toutes les prestations : la durée affichée n'entre ni dans la fin d'un RDV ni dans la fin d'un
-- créneau. « Maintenant » est FIXE (samedi 1er juin 2030, 8 h 30 à Paris) : rien ne dépend de la
-- date du jour.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins;

-- État « avant » : anciennes valeurs (70 min / 12 € chacune) + un RDV déjà enregistré.
insert into public.services (id, name, duration_min, price_label, active) values
  ('27000000-0000-4000-8000-000000000001', 'Coupe', 70, '12 €', true),
  ('27000000-0000-4000-8000-000000000002', 'Coupe + barbe', 70, '12 €', true);
insert into public.locations (id, public_label, active) values
  ('28000000-0000-4000-8000-000000000001', 'Lieu un', true);
-- Mer. 12/06/2030 10 h – 18 h : grille 10:00, 11:10, 12:20, 13:30, 14:40, 15:50, 17:00.
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('28000000-0000-4000-8000-000000000001', '2030-06-12 10:00 Europe/Paris', '2030-06-12 18:00 Europe/Paris');
insert into public.bookings (service_id, location_id, starts_at, first_name, last_name, phone)
values ('27000000-0000-4000-8000-000000000001', '28000000-0000-4000-8000-000000000001',
        '2030-06-12 10:00 Europe/Paris', 'Ancien', 'Rdv', '0639990001');

-- Étape « données » de la migration …_tarifs_durees_paiement.sql, COPIÉE à l'identique (le
-- conteneur de test ne voit pas le dossier migrations/ : pas d'include). La migration elle-même est
-- appliquée avant le test (`supabase db reset` / `migration up`, et par la CI).
create function pg_temp.etape_donnees() returns void language plpgsql as $f$
declare
  v_missing text;
begin
  select string_agg(n, ', ') into v_missing
    from unnest(array['Coupe', 'Coupe + barbe']) as n
   where not exists (select 1 from public.services s where s.name = n);
  if v_missing is not null then
    raise exception 'Prestation(s) introuvable(s) : % — migration annulée, rien n''est modifié.',
      v_missing;
  end if;

  update public.services set duration_min = 60, price_label = '10 €' where name = 'Coupe';
  update public.services set duration_min = 70, price_label = '12 €' where name = 'Coupe + barbe';
end;
$f$;

-- RDV « historique » de 60 min (ancienne règle), inséré sans trigger : il doit rester à 60 min.
set local session_replication_role = replica;
insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('29000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000002',
        '28000000-0000-4000-8000-000000000001', '2030-06-12 15:50 Europe/Paris',
        '2030-06-12 16:50 Europe/Paris', 'Vieux', 'Rdv', '0639990009');
set local session_replication_role = origin;

create temp table avant as select id, ends_at from public.bookings;

select pg_temp.etape_donnees();

select results_eq(
  $$select name, duration_min, price_label from public.services order by name$$,
  $$values ('Coupe'::text, 60, '10 €'::text), ('Coupe + barbe', 70, '12 €')$$,
  'après la migration : Coupe 60 min / 10 €, Coupe + barbe 70 min / 12 €');
select is(
  (select count(*) from public.services where id in
     ('27000000-0000-4000-8000-000000000001', '27000000-0000-4000-8000-000000000002')),
  2::bigint, 'les identifiants des prestations ne changent pas');
select results_eq(
  $$select b.id, b.ends_at from public.bookings b$$,
  $$select id, ends_at from avant$$,
  'une réservation existante garde sa date de fin d''origine');

-- Rejeu : rien ne change.
create temp table apres_un as select id, name, duration_min, price_label from public.services;
select pg_temp.etape_donnees();
select results_eq(
  $$select id, name, duration_min, price_label from public.services$$,
  $$select id, name, duration_min, price_label from apres_un$$,
  'migration rejouée une 2e fois : aucune donnée ne change');
select is((select count(*) from public.services), 2::bigint, 'le rejeu n''insère aucune prestation');

-- Prestation manquante : le script s'arrête avec un message clair et ne modifie rien. Le test
-- rejoue l'étape données sur une base où « Coupe » a disparu.
update public.services set name = 'Coupe renommée' where name = 'Coupe';
select throws_ok(
  'select pg_temp.etape_donnees()',
  'P0001', 'Prestation(s) introuvable(s) : Coupe — migration annulée, rien n''est modifié.',
  'prestation manquante : erreur claire, nommant la prestation');

-- ---------------------------------------------------------------------------
update public.services set name = 'Coupe', duration_min = 60, price_label = '10 €'
 where id = '27000000-0000-4000-8000-000000000001';
update public.services set duration_min = 70, price_label = '12 €'
 where id = '27000000-0000-4000-8000-000000000002';

create temp table rdv as
  select * from private.create_booking_at(
    '2030-06-01 08:30 Europe/Paris'::timestamptz,
    '27000000-0000-4000-8000-000000000001', '2030-06-12 11:10 Europe/Paris'::timestamptz,
    '28000000-0000-4000-8000-000000000001', 'Zoé', 'Durand', '0639990002', null, null, null);

select is(
  (select b.ends_at from public.bookings b where b.phone = '0639990002'),
  '2030-06-12 12:20 Europe/Paris'::timestamptz,
  'RDV « Coupe » (60 min affichées) : il finit 70 min après son début');
select is(
  (select count(*) from private.compute_slots('27000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris')),
  3::bigint, 'Coupe : 6 créneaux (dernier départ 15:50) moins les RDV de 10:00, 11:10 et 15:50');
select is(
  (select min(c.ends_at - c.starts_at) from private.compute_slots('27000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris') c),
  interval '70 minutes', 'Coupe : chaque créneau proposé dure 70 min');
select is(
  (select min(c.ends_at - c.starts_at) from private.compute_slots('27000000-0000-4000-8000-000000000002', '2030-06-12', '2030-06-01 08:30 Europe/Paris') c),
  interval '70 minutes', 'Coupe + barbe : chaque créneau proposé dure 70 min');
select is(
  (select count(*) from private.compute_slots('27000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris') c
    where c.starts_at = '2030-06-12 11:10 Europe/Paris'),
  0::bigint, 'le créneau déjà réservé n''est plus proposé');

-- Non-chevauchement inchangé : même créneau, autre prestation → refus.
select throws_ok(
  $$select * from private.create_booking_at(
      '2030-06-01 08:30 Europe/Paris'::timestamptz,
      '27000000-0000-4000-8000-000000000002', '2030-06-12 11:10 Europe/Paris'::timestamptz,
      '28000000-0000-4000-8000-000000000001', 'Léa', 'Martin', '0639990003', null, null, null)$$,
  'P0001', 'slot_unavailable', 'le même créneau ne se réserve pas deux fois, quelle que soit la prestation');

-- Contrainte d'exclusion elle-même (insertion directe qui chevauche le RDV de 11:10).
select throws_ok(
  $$insert into public.bookings (service_id, location_id, starts_at, first_name, last_name, phone)
    values ('27000000-0000-4000-8000-000000000002', '28000000-0000-4000-8000-000000000001',
            '2030-06-12 11:40 Europe/Paris', 'Max', 'Roux', '0639990004')$$,
  '23P01', null, 'contrainte d''exclusion : un RDV qui chevauche un RDV confirmé est refusé');

-- Corriger un détail d'un ancien RDV ne recalcule pas sa fin (reste à 60 min).
update public.bookings set first_name = 'Vieil' where id = '29000000-0000-4000-8000-000000000001';
select is(
  (select ends_at - starts_at from public.bookings where id = '29000000-0000-4000-8000-000000000001'),
  interval '60 minutes', 'ancien RDV de 60 min : sa fin n''est pas recalculée par une modification');

-- Un RDV ne peut pas déborder de la dispo : dernier créneau 17:00 → 18:10 impossible.
select is(
  (select count(*) from private.compute_slots('27000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris') c
    where c.starts_at = '2030-06-12 17:00 Europe/Paris'),
  0::bigint, 'dernier départ : 17:00 + 70 min dépasse 18:00, aucun créneau proposé');
select is(
  (select count(*) from private.compute_slots('27000000-0000-4000-8000-000000000001', '2030-06-12', '2030-06-01 08:30 Europe/Paris') c
    where c.starts_at = '2030-06-12 15:50 Europe/Paris'),
  0::bigint, 'dernier départ 15:50 : pris par l''ancien RDV de 60 min, donc non proposé');

-- Sécurité : les fonctions modifiées restent inaccessibles au public.
select ok(
  not has_function_privilege('anon', 'private.compute_slots(uuid, date, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'private.compute_slots(uuid, date, timestamptz)', 'execute'),
  'ni anon ni authenticated ne peuvent appeler private.compute_slots');
select ok(
  not has_function_privilege('anon', 'private.bookings_before_write()', 'execute')
  and not has_function_privilege('authenticated', 'private.bookings_before_write()', 'execute'),
  'ni anon ni authenticated ne peuvent appeler le trigger des réservations');

select * from finish();
rollback;
