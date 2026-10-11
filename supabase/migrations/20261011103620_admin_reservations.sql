-- =============================================================================
-- Espace admin : réservations et annulation par le barber (consigne 19). Voir docs/adr/0005.
--   1. bookings.cancelled_by : qui a annulé ('client' | 'barber'), null tant que confirmé.
--   2. bookings : plus aucun accès direct pour authenticated (lecture comprise). Tout passe
--      par les fonctions admin ci-dessous.
--   3. cancel_booking (lien client) : écrit cancelled_by = 'client'.
--   4. get_booking (lien client) : renvoie aussi cancelled_by, pour que le client voie « annulé
--      par Alix » et non « déjà annulé ». Type de retour changé : drop puis create.
--   5. admin_list_bookings('upcoming' | 'past') : liste SANS téléphone ni e-mail.
--   6. admin_get_booking(id) : détail d'une réservation, avec le contact du client.
--   7. admin_cancel_booking(id) : annulation par le barber, sans délai de 24 h. Le créneau
--      redevient réservable (décision du 2026-10-11) : la contrainte d'exclusion et le calcul
--      des créneaux ne regardent que les RDV confirmés, rien d'autre à changer.
-- Les 3 fonctions admin : security definer, réservées à un utilisateur listé dans admins (sinon
-- 42501 « forbidden »), exécutables par authenticated seulement.
-- Erreurs P0001 : invalid_input · not_found · already_started.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qui a annulé. Avant cette migration, seul le client pouvait annuler (lien personnel) :
--    les RDV déjà annulés reçoivent 'client'. La contrainte rend l'état cohérent : confirmé ⇔
--    cancelled_by null.
-- -----------------------------------------------------------------------------
alter table public.bookings
  add column cancelled_by text check (cancelled_by in ('client', 'barber'));

update public.bookings set cancelled_by = 'client'
 where status = 'cancelled' and cancelled_by is null;

alter table public.bookings
  add constraint bookings_cancelled_by_matches_status
  check ((status = 'confirmed') = (cancelled_by is null));

-- -----------------------------------------------------------------------------
-- 2. Réservations : plus de droit de table pour authenticated (ni lecture, ni écriture).
--    La policy bookings_admin_all reste en place comme filet : si un droit revenait par
--    erreur, seul un admin verrait les lignes. Conséquence pour le SQL Editor : une annulation
--    faite à la main doit écrire cancelled_by = 'barber' (contrainte ci-dessus), ou passer par
--    l'écran admin.
-- -----------------------------------------------------------------------------
revoke all on table public.bookings from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Annulation par le lien client : inchangée, sauf cancelled_by = 'client'.
-- -----------------------------------------------------------------------------
create or replace function private.cancel_booking_at(p_now timestamptz, p_token uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_cfg record;
begin
  if p_token is null or p_now is null then
    return false;
  end if;

  select * into v_booking
    from public.bookings b
   where b.cancel_token = p_token
   for update;

  if not found or v_booking.status <> 'confirmed' or v_booking.ends_at <= p_now then
    return false;
  end if;

  select * into v_cfg from private.settings();
  if p_now > v_booking.starts_at - v_cfg.cancel_notice then
    raise exception 'too_late' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'cancelled', cancelled_by = 'client'
   where id = v_booking.id;
  return true;
end;
$$;
revoke all on function private.cancel_booking_at(timestamptz, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. get_booking : mêmes règles qu'avant (aucune ligne pour un jeton inconnu ou un RDV
--    terminé ; ni adresse, ni téléphone, ni e-mail, ni nom, ni identifiant), plus
--    cancelled_by. Une colonne ajoutée change le type de retour : drop puis create, et les
--    droits sont réécrits (anon seulement).
-- -----------------------------------------------------------------------------
drop function public.get_booking(uuid);
drop function private.get_booking_at(timestamptz, uuid);

create function private.get_booking_at(p_now timestamptz, p_token uuid)
returns table (
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  can_cancel boolean,
  cancelled_by text
)
language sql
stable
set search_path = ''
as $$
  select b.status,
         b.starts_at,
         b.ends_at,
         s.name,
         l.public_label,
         b.first_name,
         (b.status = 'confirmed' and p_now <= b.starts_at - cfg.cancel_notice),
         b.cancelled_by
    from public.bookings b
    join public.services s on s.id = b.service_id
    join public.locations l on l.id = b.location_id
   cross join private.settings() cfg
   where p_token is not null
     and p_now is not null
     and b.cancel_token = p_token
     and b.ends_at > p_now;
$$;
revoke all on function private.get_booking_at(timestamptz, uuid)
  from public, anon, authenticated;

create function public.get_booking(p_token uuid)
returns table (
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  can_cancel boolean,
  cancelled_by text
)
language sql
volatile  -- pas « stable » : PostgREST accepterait alors un GET (jeton dans l'URL des journaux d'API)
security definer
set search_path = ''
as $$
  select g.status, g.starts_at, g.ends_at, g.service_name, g.location_label, g.first_name,
         g.can_cancel, g.cancelled_by
    from private.get_booking_at(now(), p_token) g;
$$;
revoke all on function public.get_booking(uuid) from public, anon, authenticated;
grant execute on function public.get_booking(uuid) to anon;

-- -----------------------------------------------------------------------------
-- 5. Liste admin. Données minimales : ni téléphone ni e-mail (ils ne sont lus qu'au détail,
--    une réservation à la fois), ni cancel_token, ni adresse privée.
--      upcoming : RDV pas encore terminés (celui en cours reste visible), chronologique.
--      past     : RDV terminés depuis au plus 30 jours, du plus récent au plus ancien.
--    Les 30 jours sont une fenêtre d'AFFICHAGE, pas une règle de réservation : constante ici
--    plutôt que dans private.settings() (changer son type de retour obligerait à recréer
--    toutes les fonctions qui la lisent). Plafond de 200 lignes : l'horizon de 4 semaines
--    borne déjà « upcoming » à une centaine de RDV au plus.
-- -----------------------------------------------------------------------------
create function private.admin_list_bookings_at(p_now timestamptz, p_scope text)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  last_name text,
  status text,
  cancelled_by text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_now is null or p_scope is null or p_scope not in ('upcoming', 'past') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  return query
    select b.id, b.starts_at, b.ends_at, s.name, l.public_label, b.first_name, b.last_name,
           b.status, b.cancelled_by
      from public.bookings b
      join public.services s on s.id = b.service_id
      join public.locations l on l.id = b.location_id
     where (p_scope = 'upcoming' and b.ends_at > p_now)
        or (p_scope = 'past' and b.ends_at <= p_now
            and b.starts_at >= p_now - interval '30 days')
     order by case when p_scope = 'upcoming' then b.starts_at end asc,
              case when p_scope = 'past' then b.starts_at end desc
     limit 200;
end;
$$;
revoke all on function private.admin_list_bookings_at(timestamptz, text)
  from public, anon, authenticated;

create function public.admin_list_bookings(p_scope text)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  last_name text,
  status text,
  cancelled_by text
)
language plpgsql
volatile  -- pas « stable » : PostgREST accepterait un GET, dont la réponse pourrait être mise en cache
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from private.admin_list_bookings_at(now(), p_scope);
end;
$$;
revoke all on function public.admin_list_bookings(text) from public, anon, authenticated;
grant execute on function public.admin_list_bookings(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Détail admin d'une réservation : le seul endroit où sortent téléphone et e-mail (le
--    client peut n'avoir donné que son e-mail : sans lui, Alix ne pourrait pas le prévenir).
-- -----------------------------------------------------------------------------
create function public.admin_get_booking(p_id uuid)
returns table (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  last_name text,
  phone text,
  email text,
  status text,
  cancelled_by text
)
language plpgsql
volatile  -- pas « stable » : la réponse contient le contact du client, jamais en GET
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  return query
    select b.id, b.starts_at, b.ends_at, s.name, l.public_label, b.first_name, b.last_name,
           b.phone, b.email, b.status, b.cancelled_by
      from public.bookings b
      join public.services s on s.id = b.service_id
      join public.locations l on l.id = b.location_id
     where b.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.admin_get_booking(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_booking(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Annulation par le barber. Logique ici, avec « maintenant » injecté (p_now) : les tests
--    vérifient les limites à date fixe. Aucun droit d'exécution.
--      true            → annulé maintenant (cancelled_by = 'barber'), sans délai de 24 h ;
--      false           → déjà annulé (par le client ou par le barber) : un double clic ou un
--                        rejeu après coupure réseau ne fait rien de plus ;
--      already_started → RDV commencé ou passé : l'historique ne se réécrit pas ;
--      not_found       → identifiant inconnu.
--    Verrou de ligne (for update) : deux annulations simultanées sont sérialisées, la seconde
--    voit « cancelled » et renvoie false. Pas de verrou consultatif : annuler ne fait que
--    libérer un créneau, la contrainte d'exclusion protège les réservations concurrentes.
-- -----------------------------------------------------------------------------
create function private.admin_cancel_booking_at(p_now timestamptz, p_id uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if p_now is null or p_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select * into v_booking from public.bookings b where b.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then
    return false;
  end if;
  if v_booking.starts_at <= p_now then
    raise exception 'already_started' using errcode = 'P0001';
  end if;

  update public.bookings set status = 'cancelled', cancelled_by = 'barber'
   where id = v_booking.id;
  return true;
end;
$$;
revoke all on function private.admin_cancel_booking_at(timestamptz, uuid)
  from public, anon, authenticated;

create function public.admin_cancel_booking(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return private.admin_cancel_booking_at(now(), p_id);
end;
$$;
revoke all on function public.admin_cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_booking(uuid) to authenticated;
