-- Lieux sans adresse (consigne 24, ADR 0008) : la colonne et ses contraintes ont disparu, les
-- droits sur locations sont inchangés (anon : rien ; connecté : id, public_label, active,
-- filtrés par RLS), et la garde de la migration reconnaît bien une VRAIE adresse.
-- La garde elle-même (bloc do de la migration) a été rejouée sur une base locale avec une vraie
-- adresse : elle annule la migration (voir la PR #35). Ici, on teste la fonction qu'elle appelle.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

truncate public.bookings, public.availabilities, public.locations, public.admins;

-- Identifiants FICTIFS.
insert into auth.users (id, email) values
  ('32000000-0000-4000-8000-000000000001', 'curieux@example.test');
insert into public.locations (id, public_label, active) values
  ('22000000-0000-4000-8000-000000000001', 'Lieu un', false);

-- ---------------------------------------------------------------------------
-- 1. Schéma : plus de colonne d'adresse, plus de contrainte qui en dépendait.
-- ---------------------------------------------------------------------------
select hasnt_column('public', 'locations', 'private_address',
  'locations : la colonne d''adresse n''existe plus');
select results_eq(
  $$select conname::text collate "default" from pg_constraint
     where conrelid = 'public.locations'::regclass order by 1$$,
  $$values ('locations_pkey'), ('locations_public_label_check')$$,
  'locations : seules la clé primaire et la contrainte du libellé restent');

-- ---------------------------------------------------------------------------
-- 2. Garde : valeurs provisoires reconnues (reprises de l'ancienne contrainte de 08_regles et
--    des seeds, dont les anciens lieux de production), vraies adresses refusées.
-- ---------------------------------------------------------------------------
select is_empty(
  $$select v from (values
      ('À RENSEIGNER'), ('  à renseigner '), ('ADRESSE RÉELLE'), ('adresse réelle'),
      (U&'\00A0\00E0 renseigner'), (U&'\0009\00E0 renseigner\000A'), ('a renseigner'),
      ('À  RENSEIGNER.'), (U&'a\0300 renseigner'), ('Adresse reelle'),
      ('1 rue de l''Exemple, 00000 Villetest (adresse factice)'),
      ('2 avenue Fictive, 00000 Villetest (adresse factice)  '),
      ('Adresse factice (dev local)'), (''), ('   '), (null)
    ) t(v)
    where not private.is_placeholder_address(v)$$,
  'garde : toutes les valeurs provisoires connues sont reconnues');
select is_empty(
  $$select v from (values
      ('12 rue des Lilas, 49130 Les Ponts-de-Cé'),
      ('3 rue Factice, 00000 Testville'),
      ('À RENSEIGNER : 12 rue des Lilas'),
      ('Adresse factice (dev local) puis 12 rue des Lilas'),
      ('12 rue des Lilas, 49130 Les Ponts-de-Cé (adresse factice)'),
      ('À RENSEIGNER 49130'),
      ('adresse réelle 12'),
      ('Chez mes parents, 2e étage')
    ) t(v)
    where private.is_placeholder_address(v)$$,
  'garde : une vraie adresse n''est jamais prise pour une valeur provisoire');
select ok(
  not has_function_privilege('anon', 'private.is_placeholder_address(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.is_placeholder_address(text)', 'execute'),
  'garde : fonction interne, exécutable ni par anon ni par un connecté');

-- ---------------------------------------------------------------------------
-- 3. anon : aucun accès direct aux lieux (il ne voit que public_label, via les RPC).
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.locations', '42501', null,
  'anon : select * sur locations refusé');
select throws_ok('select id, public_label, active from public.locations', '42501', null,
  'anon : même id, public_label, active refusés');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Connecté non admin : droit de colonne limité à id, public_label, active, et 0 ligne (RLS).
-- ---------------------------------------------------------------------------
select results_eq(
  $$select column_name::text collate "default" from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'locations'
       and grantee = 'authenticated' and privilege_type = 'SELECT' order by 1$$,
  $$values ('active'), ('id'), ('public_label')$$,
  'connecté : lecture limitée à id, public_label, active');
set local role authenticated;
set local request.jwt.claims = '{"sub": "32000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is((select count(*) from public.locations), 0::bigint,
  'connecté non admin : ne voit aucun lieu');
select throws_ok('select * from public.locations', '42501', null,
  'connecté non admin : select * refusé');
reset role;

select * from finish();
rollback;
