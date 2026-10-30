-- =============================================================================
-- Notifications push à l'admin (nouvelle réservation, annulation par le client).
-- Voir docs/adr/0012-notifications-push-admin.md.
--
--   1. private.settings() : + push_max_devices (5 appareils par admin).
--   2. Table push_subscriptions : un abonnement web push par appareil de l'admin. RLS activé,
--      AUCUN droit de table pour anon ni authenticated : tout passe par des fonctions.
--   3. Fonctions admin (authenticated, puis require_admin()) :
--      admin_save_push_subscription, admin_delete_push_subscription, admin_send_test_push.
--   4. Fonctions de l'Edge Function notify-booking (service_role SEULEMENT) :
--      notify_booking_payload, notify_push_subscriptions, notify_forget_push_subscription.
--   5. private.notify_booking_event : appel HTTP (pg_net) de l'Edge Function, avec l'URL et le
--      secret partagé lus dans Vault. Sans ces secrets (base locale, CI) : ne fait rien.
--      Ne lève JAMAIS d'erreur : une notification en panne ne doit pas empêcher une réservation.
--   6. Trigger sur bookings : nouvelle réservation confirmée, annulation PAR LE CLIENT.
--      (Une annulation faite par Alix depuis l'admin ne le notifie pas : il le sait déjà.)
--
-- Données transmises par pg_net : le type d'évènement et l'id de la réservation, rien
-- d'autre. Le prénom, la date et la prestation sont lus par l'Edge Function, puis chiffrés
-- pour l'appareil d'Alix (web push, RFC 8291) : le service de push ne peut pas les lire.
-- =============================================================================

-- pg_net : requêtes HTTP asynchrones depuis la base (envoyées après le COMMIT, par un worker).
-- Vault : secrets chiffrés (URL de la fonction, secret partagé), jamais dans une migration.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- -----------------------------------------------------------------------------
-- 1. Règles métier : mêmes valeurs qu'avant + push_max_devices. Aucune fonction n'en dépend
--    au sens de pg_depend : elles la relisent par son nom (cf. …_admin_galerie.sql).
-- -----------------------------------------------------------------------------
drop function private.settings();
create function private.settings()
returns table (
  slot_step interval,             -- pas de la grille de créneaux (part du début de chaque dispo)
  min_notice interval,            -- délai minimum entre maintenant et le début du RDV
  max_advance interval,           -- horizon maximum de réservation
  cancel_notice interval,         -- annulation client possible jusqu'à X avant le RDV
  max_future_bookings integer,    -- RDV futurs max par téléphone ou par email
  data_retention interval,        -- conservation des données clients après le RDV (purge à coder)
  gallery_max_items integer,      -- photos max dans la galerie (publiées ou non)
  request_replay_window interval, -- rejeu d'une réservation (même clé) accepté pendant X
  push_max_devices integer        -- appareils abonnés aux notifications, par admin
)
language sql
stable
set search_path = ''
as $$
  select
    interval '70 minutes',
    interval '2 hours',
    interval '28 days',
    interval '24 hours',
    2,
    interval '6 months',
    60,
    interval '30 minutes',
    5;
$$;
revoke all on function private.settings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Abonnements push. endpoint : l'adresse du service de push de l'appareil (https, unique).
--    p256dh / auth : clé publique et secret de l'appareil, en base64url (servent à chiffrer).
-- -----------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- auth.users (et non admins) : les tests vident admins par TRUNCATE. Un appareil dont le
  -- propriétaire n'est plus admin est ignoré à l'envoi (notify_push_subscriptions).
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique
    check (char_length(endpoint) between 12 and 1000 and endpoint ~ '^https://[^[:space:]]+$'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
-- Filet, comme bookings_admin_all : sans aucun droit de table, cette policy n'ouvre rien. Si un
-- droit revenait par erreur, un admin ne verrait que SES appareils, et personne d'autre rien.
create policy push_subscriptions_admin_own on public.push_subscriptions
  for all to authenticated
  using (private.is_admin() and user_id = (select auth.uid()))
  with check (private.is_admin() and user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- 5. Appel de l'Edge Function (défini avant les fonctions qui l'utilisent).
--    kind : 'new_booking' | 'cancelled' (avec p_booking_id) | 'test' (sans).
--    Renvoie vrai si la requête a été mise en file, faux sinon (non configuré, erreur).
-- -----------------------------------------------------------------------------
create function private.notify_booking_event(p_kind text, p_booking_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if p_kind not in ('new_booking', 'cancelled', 'test')
     or (p_kind <> 'test' and p_booking_id is null) then
    return false;
  end if;

  select s.decrypted_secret into v_url
    from vault.decrypted_secrets s where s.name = 'notify_booking_url';
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s where s.name = 'notify_booking_secret';
  if v_url is null or v_url !~ '^https://' or coalesce(v_secret, '') = '' then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', p_kind, 'booking_id', p_booking_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return true;
exception when others then
  -- Jamais d'échec propagé : la réservation (ou l'annulation) doit aboutir quoi qu'il arrive.
  raise warning 'notify_booking_event: %', sqlstate;
  return false;
end;
$$;
revoke all on function private.notify_booking_event(text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Fonctions admin.
-- -----------------------------------------------------------------------------

-- Enregistre (ou rafraîchit) l'abonnement de l'appareil courant. Au-delà de push_max_devices
-- appareils, les plus anciens sont oubliés (un téléphone remplacé ne bloque rien).
create function public.admin_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_max integer;
begin
  perform private.require_admin();
  if p_endpoint is null or p_p256dh is null or p_auth is null
     or char_length(p_endpoint) not between 12 and 1000
     or p_endpoint !~ '^https://[^[:space:]]+$'
     or p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$'
     or p_auth !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        created_at = now();

  select s.push_max_devices into v_max from private.settings() s;
  delete from public.push_subscriptions p
   where p.user_id = v_user
     and p.id not in (
       select q.id from public.push_subscriptions q
        where q.user_id = v_user
        order by q.created_at desc, q.id
        limit v_max
     );
end;
$$;
revoke all on function public.admin_save_push_subscription(text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_save_push_subscription(text, text, text) to authenticated;

-- Oublie l'abonnement de l'appareil courant (bouton « Désactiver »). Vrai s'il existait.
create function public.admin_delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  delete from public.push_subscriptions p
   where p.endpoint = p_endpoint and p.user_id = (select auth.uid());
  return found;
end;
$$;
revoke all on function public.admin_delete_push_subscription(text) from public, anon, authenticated;
grant execute on function public.admin_delete_push_subscription(text) to authenticated;

-- Notification de test vers tous les appareils de l'admin.
-- 'queued' : envoyée · 'no_device' : aucun appareil abonné · 'not_configured' : serveur de
-- notifications pas encore branché (secrets Vault absents).
create function public.admin_send_test_push()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (
    select 1 from public.push_subscriptions p where p.user_id = (select auth.uid())
  ) then
    return 'no_device';
  end if;
  if private.notify_booking_event('test', null) then
    return 'queued';
  end if;
  return 'not_configured';
end;
$$;
revoke all on function public.admin_send_test_push() from public, anon, authenticated;
grant execute on function public.admin_send_test_push() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Fonctions de l'Edge Function : service_role SEULEMENT (clé serveur, jamais dans le front).
-- -----------------------------------------------------------------------------

-- Ce que la notification affiche : début, prénom, prestation. Ni nom, ni téléphone, ni e-mail.
create function public.notify_booking_payload(p_booking_id uuid)
returns table (
  status text,
  cancelled_by text,
  starts_at timestamptz,
  first_name text,
  service_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.status, b.cancelled_by, b.starts_at, b.first_name, s.name
    from public.bookings b
    join public.services s on s.id = b.service_id
   where b.id = p_booking_id;
$$;
revoke all on function public.notify_booking_payload(uuid) from public, anon, authenticated;
grant execute on function public.notify_booking_payload(uuid) to service_role;

create function public.notify_push_subscriptions()
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.endpoint, p.p256dh, p.auth
    from public.push_subscriptions p
    join public.admins a on a.user_id = p.user_id
   order by p.created_at;
$$;
revoke all on function public.notify_push_subscriptions() from public, anon, authenticated;
grant execute on function public.notify_push_subscriptions() to service_role;

-- Abonnement refusé par le service de push (404 / 410 : appareil désabonné) : on l'oublie.
create function public.notify_forget_push_subscription(p_endpoint text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions p where p.endpoint = p_endpoint;
$$;
revoke all on function public.notify_forget_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.notify_forget_push_subscription(text) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Trigger : AFTER (la ligne est valide et écrite). Si la transaction est annulée, pg_net
--    n'envoie rien : sa file est elle-même une table, annulée avec le reste.
-- -----------------------------------------------------------------------------
create function private.bookings_notify()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'confirmed' then
    perform private.notify_booking_event('new_booking', new.id);
  elsif tg_op = 'UPDATE' and old.status = 'confirmed' and new.status = 'cancelled'
        and new.cancelled_by = 'client' then
    perform private.notify_booking_event('cancelled', new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.bookings_notify() from public, anon, authenticated;

create trigger bookings_notify
  after insert or update of status on public.bookings
  for each row execute function private.bookings_notify();
