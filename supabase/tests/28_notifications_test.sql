-- Notifications push à l'admin (ADR 0012) : table des abonnements fermée, fonctions admin et
-- fonctions de l'Edge Function, limite d'appareils, et trigger sur bookings (file pg_net).
-- Les secrets Vault de test sont créés DANS la transaction : le rollback final les efface.
-- Identifiants, endpoints et clés FICTIFS.
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

select plan(55);

truncate public.bookings, public.availabilities, public.locations, public.services,
         public.gallery_items, public.admins, public.push_subscriptions;
delete from vault.secrets where name in ('notify_booking_url', 'notify_booking_secret');

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'curieux@example.test');
insert into public.admins (user_id) values ('30000000-0000-4000-8000-000000000001');

insert into public.services (id, name, duration_min, active) values
  ('10000000-0000-4000-8000-000000000001', 'Coupe', 60, true);
insert into public.locations (id, public_label, active) values
  ('20000000-0000-4000-8000-000000000001', 'Ville un', true);
insert into public.availabilities (location_id, starts_at, ends_at) values
  ('20000000-0000-4000-8000-000000000001', '2030-03-06 10:00 Europe/Paris', '2030-03-06 18:00 Europe/Paris');

-- Clé publique (87 car.) et secret (22 car.) au format base64url d'un vrai abonnement.
create temporary table k (p256dh text, auth text) on commit drop;
insert into k values (repeat('A', 87), repeat('B', 22));
grant select on k to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Table : RLS activé, aucun droit pour anon ni authenticated.
-- ---------------------------------------------------------------------------
select has_table('public', 'push_subscriptions', 'table push_subscriptions');
select ok((select relrowsecurity from pg_class where oid = 'public.push_subscriptions'::regclass),
  'RLS activé sur push_subscriptions');
select ok(not has_table_privilege('anon', 'public.push_subscriptions', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon : aucun droit sur push_subscriptions');
select ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated : aucun droit direct sur push_subscriptions');

-- ---------------------------------------------------------------------------
-- 2. Droits d'exécution : admin_* à authenticated seulement ; notify_* à service_role seulement.
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.admin_save_push_subscription(text,text,text)', 'execute')
      and has_function_privilege('authenticated', 'public.admin_save_push_subscription(text,text,text)', 'execute'),
  'admin_save_push_subscription : authenticated seulement');
select ok(not has_function_privilege('anon', 'public.admin_delete_push_subscription(text)', 'execute')
      and has_function_privilege('authenticated', 'public.admin_delete_push_subscription(text)', 'execute'),
  'admin_delete_push_subscription : authenticated seulement');
select ok(not has_function_privilege('anon', 'public.admin_send_test_push()', 'execute')
      and has_function_privilege('authenticated', 'public.admin_send_test_push()', 'execute'),
  'admin_send_test_push : authenticated seulement');
select ok(not has_function_privilege('anon', 'public.notify_booking_payload(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_booking_payload(uuid)', 'execute')
      and has_function_privilege('service_role', 'public.notify_booking_payload(uuid)', 'execute'),
  'notify_booking_payload : service_role seulement');
select ok(not has_function_privilege('anon', 'public.notify_push_subscriptions()', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_push_subscriptions()', 'execute')
      and has_function_privilege('service_role', 'public.notify_push_subscriptions()', 'execute'),
  'notify_push_subscriptions : service_role seulement');
select ok(not has_function_privilege('anon', 'public.notify_forget_push_subscription(text)', 'execute')
      and not has_function_privilege('authenticated', 'public.notify_forget_push_subscription(text)', 'execute')
      and has_function_privilege('service_role', 'public.notify_forget_push_subscription(text)', 'execute'),
  'notify_forget_push_subscription : service_role seulement');
select ok(not has_function_privilege('authenticated', 'private.notify_booking_event(text,uuid)', 'execute')
      and not has_function_privilege('anon', 'private.notify_booking_event(text,uuid)', 'execute'),
  'private.notify_booking_event : personne de l''API');
select is((select push_max_devices from private.settings()), 5, 'private.settings() : 5 appareils');

-- ---------------------------------------------------------------------------
-- 3. anon et connecté non admin : refusés.
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/a', 'x', 'y')$$,
  '42501', null, 'anon : enregistrement refusé');
select throws_ok('select count(*) from public.push_subscriptions', '42501', null,
  'anon : lecture de la table refusée');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000002", "role": "authenticated"}';
select throws_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/a',
                   (select p256dh from k), (select auth from k))$$,
  '42501', 'forbidden', 'non admin : enregistrement refusé');
select throws_ok($$select public.admin_delete_push_subscription('https://web.push.apple.com/a')$$,
  '42501', 'forbidden', 'non admin : suppression refusée');
select throws_ok($$select public.admin_send_test_push()$$,
  '42501', 'forbidden', 'non admin : notification de test refusée');
select throws_ok('select count(*) from public.push_subscriptions', '42501', null,
  'non admin : lecture de la table refusée');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Admin : enregistrer, rafraîchir, valider, limiter à 5, supprimer.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select is(public.admin_send_test_push(), 'no_device', 'test sans appareil abonné : no_device');
select lives_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/a',
                  (select p256dh from k), (select auth from k))$$,
  'admin : abonnement enregistré');
select lives_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/a',
                  (select p256dh from k), (select auth from k))$$,
  'admin : même appareil réenregistré sans erreur (idempotent)');
select throws_ok($$select public.admin_save_push_subscription('http://push.example.test/a',
                   (select p256dh from k), (select auth from k))$$,
  'P0001', 'invalid_input', 'endpoint non https refusé');
select throws_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/b',
                   'pas une clé !', (select auth from k))$$,
  'P0001', 'invalid_input', 'clé d''appareil invalide refusée');
select throws_ok($$select public.admin_save_push_subscription('https://web.push.apple.com/b',
                   (select p256dh from k), null)$$,
  'P0001', 'invalid_input', 'secret manquant refusé');
select throws_ok($$select public.admin_save_push_subscription('https://pirate.example.test/push',
                   (select p256dh from k), (select auth from k))$$,
  'P0001', 'invalid_input', 'adresse hors des services de push connus refusée (pas de requête vers un hôte choisi)');
select is(public.admin_send_test_push(), 'not_configured',
  'test sans secrets Vault : not_configured (rien n''est envoyé)');
reset role;

select is((select count(*) from public.push_subscriptions), 1::bigint,
  'un seul abonnement pour un appareil enregistré deux fois');

-- 6 appareils de plus (dates croissantes) : seuls les 5 plus récents restent.
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select public.admin_save_push_subscription('https://web.push.apple.com/' || n,
         (select p256dh from k), (select auth from k))
  from generate_series(1, 6) n;
reset role;
-- Toutes les lignes ont le même now() (même transaction) : on date à la main pour l'ordre.
update public.push_subscriptions set created_at = now() - interval '1 hour'
 where endpoint = 'https://web.push.apple.com/a';
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select public.admin_save_push_subscription('https://web.push.apple.com/7',
         (select p256dh from k), (select auth from k));
reset role;
select is((select count(*) from public.push_subscriptions), 5::bigint,
  'au plus 5 appareils par admin');
select ok(not exists (select 1 from public.push_subscriptions where endpoint = 'https://web.push.apple.com/a'),
  'l''appareil le plus ancien est oublié en premier');

set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.admin_delete_push_subscription('https://web.push.apple.com/7'), true,
  'admin : désactivation de l''appareil courant');
select is(public.admin_delete_push_subscription('https://web.push.apple.com/7'), false,
  'désactivation répétée : rien à supprimer');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Trigger SANS secrets Vault : la réservation passe, rien n'est mis en file.
-- ---------------------------------------------------------------------------
create temporary table q0 as select count(*) as n from net.http_request_queue;

insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', '2030-03-06 10:00 Europe/Paris', now(),
        'Léa', 'Martin', '0700000001');
select is((select count(*) from net.http_request_queue) - (select n from q0), 0::bigint,
  'sans secrets : réservation enregistrée, aucune requête HTTP');

-- ---------------------------------------------------------------------------
-- 6. Trigger AVEC secrets : nouvelle réservation et annulation client mises en file,
--    annulation par le barber ignorée. Le corps ne contient que le type et l'id.
-- ---------------------------------------------------------------------------
select vault.create_secret('https://fonctions.example.test/notify-booking', 'notify_booking_url');
select vault.create_secret('secret-de-test-tres-long-0123456789', 'notify_booking_secret');
create temporary table q1 as select coalesce(max(id), 0) as last_id from net.http_request_queue;

insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', '2030-03-06 11:10 Europe/Paris', now(),
        'Tom', 'Durand', '0700000002');
select is(
  (select convert_from(body, 'UTF8')::jsonb from net.http_request_queue where id > (select last_id from q1) order by id limit 1),
  '{"kind": "new_booking", "booking_id": "60000000-0000-4000-8000-000000000002"}'::jsonb,
  'nouvelle réservation : type et id seulement, aucune donnée client');
select is(
  (select url from net.http_request_queue where id > (select last_id from q1) order by id limit 1),
  'https://fonctions.example.test/notify-booking',
  'requête vers l''URL enregistrée dans Vault');
select is(
  (select headers->>'x-notify-secret' from net.http_request_queue
    where id > (select last_id from q1) order by id limit 1),
  'secret-de-test-tres-long-0123456789',
  'secret partagé transmis en en-tête');

update public.bookings set status = 'cancelled', cancelled_by = 'client'
 where id = '60000000-0000-4000-8000-000000000002';
select is(
  (select convert_from(body, 'UTF8')::jsonb from net.http_request_queue where id > (select last_id from q1) order by id desc limit 1),
  '{"kind": "cancelled", "booking_id": "60000000-0000-4000-8000-000000000002"}'::jsonb,
  'annulation par le client : notifiée');

update public.bookings set status = 'cancelled', cancelled_by = 'barber'
 where id = '60000000-0000-4000-8000-000000000001';
select is((select count(*) from net.http_request_queue where id > (select last_id from q1)), 2::bigint,
  'annulation par le barber : pas de notification (2 requêtes au total)');

update public.bookings set first_name = 'Tomy' where id = '60000000-0000-4000-8000-000000000002';
select is((select count(*) from net.http_request_queue where id > (select last_id from q1)), 2::bigint,
  'autre modification (prénom) : pas de notification');

-- Notification de test : 4 appareils encore abonnés et secrets présents.
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.admin_send_test_push(), 'queued', 'test avec secrets et appareil : queued');
reset role;
select is(
  (select convert_from(body, 'UTF8')::jsonb from net.http_request_queue where id > (select last_id from q1) order by id desc limit 1),
  '{"kind": "test", "booking_id": null}'::jsonb,
  'notification de test mise en file');

-- URL non https dans Vault : rien n'est envoyé.
select vault.update_secret((select id from vault.secrets where name = 'notify_booking_url'),
                           'http://fonctions.example.test/notify-booking');
select is(private.notify_booking_event('new_booking', '60000000-0000-4000-8000-000000000002'), false,
  'URL non https : aucune requête');
select vault.update_secret((select id from vault.secrets where name = 'notify_booking_url'),
                           'https://fonctions.example.test/notify-booking');

-- Anti-abus : au plus push_max_per_hour (10) notifications par heure, tous types confondus.
insert into private.notify_log (kind)
select 'new_booking' from generate_series(1, 10 - (select count(*) from private.notify_log
                                                   where sent_at > now() - interval '1 hour'));
create temporary table q2 as select coalesce(max(id), 0) as last_id from net.http_request_queue;
insert into public.bookings (id, service_id, location_id, starts_at, ends_at, first_name, last_name, phone)
values ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', '2030-03-06 12:20 Europe/Paris', now(),
        'Ana', 'Blanc', '0700000003');
select is((select count(*) from net.http_request_queue where id > (select last_id from q2)), 0::bigint,
  'au-delà de 10 notifications dans l''heure : réservation enregistrée, plus rien n''est envoyé');
select ok(exists (select 1 from public.bookings where id = '60000000-0000-4000-8000-000000000003'),
  'la limite des notifications ne bloque jamais la réservation');
select ok(not has_table_privilege('authenticated', 'private.notify_log', 'SELECT,INSERT,DELETE')
      and not has_table_privilege('anon', 'private.notify_log', 'SELECT,INSERT,DELETE'),
  'journal des notifications : aucun droit pour anon ni authenticated');

-- pg_net : aucun droit pour les rôles de l'API (la plateforme en donne à la création).
select ok(not has_schema_privilege('anon', 'net', 'USAGE')
      and not has_schema_privilege('authenticated', 'net', 'USAGE'),
  'schéma net fermé à anon et authenticated');
select ok(not has_table_privilege('anon', 'net.http_request_queue', 'SELECT')
      and not has_table_privilege('authenticated', 'net.http_request_queue', 'SELECT'),
  'file des requêtes HTTP (qui contient le secret) illisible pour anon et authenticated');
-- Droit EXPLICITE retiré (celui que donne la plateforme). Sans USAGE sur le schéma, un
-- éventuel EXECUTE hérité de PUBLIC reste inutilisable par ces rôles.
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
    where n.nspname = 'net'
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)),
  0::bigint,
  'aucun EXECUTE explicite sur les fonctions de pg_net pour anon ou authenticated');

-- Appareil d'un utilisateur qui n'est (plus) admin : jamais destinataire.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('30000000-0000-4000-8000-000000000002', 'https://web.push.apple.com/ancien',
        (select p256dh from k), (select auth from k));
select ok(not exists (select 1 from public.notify_push_subscriptions()
                       where endpoint = 'https://web.push.apple.com/ancien'),
  'un appareil qui n''appartient pas à un admin ne reçoit rien');
select is((select count(*) from public.notify_push_subscriptions()), 4::bigint,
  'les 4 appareils de l''admin reçoivent');

-- ---------------------------------------------------------------------------
-- 7. Ce que lit l'Edge Function : prénom, début, prestation, statut. Jamais de contact.
-- ---------------------------------------------------------------------------
select results_eq(
  $$select status, cancelled_by, first_name, service_name
      from public.notify_booking_payload('60000000-0000-4000-8000-000000000002')$$,
  $$values ('cancelled'::text, 'client'::text, 'Tomy'::text, 'Coupe'::text)$$,
  'notify_booking_payload : statut, qui a annulé, prénom, prestation');
select is(
  (select string_agg(n, ',' order by n)
     from unnest((select proargnames from pg_proc where proname = 'notify_booking_payload')) n),
  'cancelled_by,first_name,p_booking_id,service_name,starts_at,status',
  'notify_booking_payload : aucune colonne de contact (ni nom, téléphone, e-mail, jeton)');

-- ---------------------------------------------------------------------------
-- 8. Couper les autres appareils (mot de passe changé) ou tous (téléphone perdu).
-- ---------------------------------------------------------------------------
create temporary table garde as
  select endpoint from public.push_subscriptions
   where user_id = '30000000-0000-4000-8000-000000000001' order by endpoint limit 1;
grant select on garde to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub": "30000000-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.admin_delete_push_subscriptions((select endpoint from garde)), 3,
  'déconnexion des autres appareils : les 3 autres sont oubliés');
select is(public.admin_delete_push_subscriptions(), 1, 'téléphone perdu : le dernier aussi');
reset role;
select is((select count(*) from public.notify_push_subscriptions()), 0::bigint,
  'plus aucun appareil de l''admin ne reçoit de notification');
select ok(exists (select 1 from public.push_subscriptions where endpoint = 'https://web.push.apple.com/ancien'),
  'les appareils des autres utilisateurs ne sont pas touchés');

select * from finish();
rollback;
