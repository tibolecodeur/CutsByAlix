-- =============================================================================
-- Espace admin : plages de disponibilité (consigne 18). Voir docs/adr/0004.
--   1. locations : l'admin ne lit plus que id, public_label et active. Jamais private_address
--      (saisie dans le SQL Editor par le développeur), et plus aucune écriture via l'API.
--   2. availabilities : plus d'écriture directe. Création et suppression passent par des
--      fonctions admin dédiées, qui valident tout côté base.
--   3. admin_booking_rules : règles lues dans private.settings() (le front ne code jamais
--      70 min / 48 h / 4 semaines en dur).
--   4. admin_list_availabilities : plages non terminées, avec nombre de créneaux et de RDV.
--   5. admin_create_availability (+ private.admin_create_availability_at, testable à date fixe).
--   6. admin_delete_availability : refusée dès qu'une réservation confirmée est dans la plage.
-- Les 4 fonctions publiques : security definer, réservées à un utilisateur listé dans admins
-- (sinon 42501 « forbidden »), exécutables par authenticated seulement.
-- Erreurs P0001 : invalid_input · invalid_range · in_past · too_short · location_inactive ·
-- availability_overlap · availability_has_bookings · not_found.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Lieux : droit de lecture par COLONNE. La policy locations_admin_all (is_admin) filtre
--    toujours les lignes : un connecté non admin ne voit rien. Un « select * » ou une lecture
--    de private_address par l'admin échoue désormais en 42501.
-- -----------------------------------------------------------------------------
revoke all on table public.locations from authenticated;
grant select (id, public_label, active) on table public.locations to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Plages : lecture admin conservée (RLS), écritures uniquement par les fonctions ci-dessous.
--    Les contraintes (fin > début, 24 h max, aucun chevauchement) et le trigger
--    availabilities_before_change restent le filet de sécurité, y compris dans le SQL Editor.
-- -----------------------------------------------------------------------------
revoke insert, update, delete on table public.availabilities from authenticated;

-- -----------------------------------------------------------------------------
-- Interne : refuse tout appelant qui n'est pas dans admins.
-- -----------------------------------------------------------------------------
create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_admin() from public, anon, authenticated;

-- Interne : nombre de créneaux d'une plage. Grille au pas slot_step depuis le début de la
-- plage ; un créneau compte s'il tient entièrement (longueur = slot_step).
create function private.availability_slot_count(p_starts_at timestamptz, p_ends_at timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from private.settings() cfg
   cross join lateral generate_series(p_starts_at, p_ends_at - cfg.slot_step, cfg.slot_step) g;
$$;
revoke all on function private.availability_slot_count(timestamptz, timestamptz)
  from public, anon, authenticated;

-- Interne : nombre de RDV confirmés du lieu qui touchent la plage (passés comme futurs).
create function private.availability_booking_count(
  p_location_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.bookings b
   where b.status = 'confirmed'
     and b.location_id = p_location_id
     and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)');
$$;
revoke all on function private.availability_booking_count(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Règles utiles à l'écran admin, en nombres simples.
-- -----------------------------------------------------------------------------
create function public.admin_booking_rules()
returns table (
  slot_step_min integer,     -- pas de la grille et longueur d'un créneau
  min_notice_min integer,    -- réservation au plus tard X minutes avant le créneau
  max_advance_days integer   -- horizon, en jours calendaires de Paris
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select (extract(epoch from cfg.slot_step) / 60)::integer,
           (extract(epoch from cfg.min_notice) / 60)::integer,
           extract(day from cfg.max_advance)::integer
      from private.settings() cfg;
end;
$$;
revoke all on function public.admin_booking_rules() from public, anon, authenticated;
grant execute on function public.admin_booking_rules() to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Plages pas encore terminées, dans l'ordre chronologique. Libellé public seulement.
-- -----------------------------------------------------------------------------
create function public.admin_list_availabilities()
returns table (
  id uuid,
  location_id uuid,
  location_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  slot_count integer,
  booking_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select a.id,
           a.location_id,
           l.public_label,
           a.starts_at,
           a.ends_at,
           private.availability_slot_count(a.starts_at, a.ends_at),
           private.availability_booking_count(a.location_id, a.starts_at, a.ends_at)
      from public.availabilities a
      join public.locations l on l.id = a.location_id
     where a.ends_at > now()
     order by a.starts_at;
end;
$$;
revoke all on function public.admin_list_availabilities() from public, anon, authenticated;
grant execute on function public.admin_list_availabilities() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Création. Toute la logique ici, avec « maintenant » injecté (p_now) : les tests vérifient
--    les limites à date fixe. Aucun droit d'exécution : seule la fonction publique l'appelle.
-- -----------------------------------------------------------------------------
create function private.admin_create_availability_at(
  p_now timestamptz,
  p_location_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  id uuid,
  location_id uuid,
  location_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  slot_count integer,
  booking_count integer
)
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cfg record;
  v_label text;
  v_row public.availabilities%rowtype;
begin
  if p_now is null or p_location_id is null or p_starts_at is null or p_ends_at is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
    raise exception 'invalid_range' using errcode = 'P0001';
  end if;
  if p_starts_at <= p_now then
    raise exception 'in_past' using errcode = 'P0001';
  end if;
  select * into v_cfg from private.settings();
  if p_ends_at - p_starts_at < v_cfg.slot_step then
    raise exception 'too_short' using errcode = 'P0001';
  end if;

  -- Lieu inconnu ou inactif : même réponse (un lieu inactif n'a pas encore d'adresse réelle).
  -- FOR SHARE : le lieu ne peut pas être désactivé pendant la création.
  select l.public_label into v_label
    from public.locations l
   where l.id = p_location_id and l.active
     for share;
  if not found then
    raise exception 'location_inactive' using errcode = 'P0001';
  end if;

  -- Même verrou que private.create_booking_at : une plage n'apparaît ni ne disparaît entre la
  -- vérification d'un créneau et l'insertion d'une réservation.
  perform pg_advisory_xact_lock(hashtextextended('booking:slots', 0));

  -- Chevauchement, tous lieux confondus. '[)' : 10h-12h et 12h-14h se touchent sans se
  -- chevaucher. La contrainte d'exclusion reste le filet (exception ci-dessous).
  if exists (
    select 1 from public.availabilities a
     where tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'availability_overlap' using errcode = 'P0001';
  end if;

  begin
    insert into public.availabilities (location_id, starts_at, ends_at)
    values (p_location_id, p_starts_at, p_ends_at)
    returning * into v_row;
  exception
    when exclusion_violation then
      raise exception 'availability_overlap' using errcode = 'P0001';
  end;

  return query
    select v_row.id, v_row.location_id, v_label, v_row.starts_at, v_row.ends_at,
           private.availability_slot_count(v_row.starts_at, v_row.ends_at),
           0;
end;
$$;
revoke all on function private.admin_create_availability_at(timestamptz, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

create function public.admin_create_availability(
  p_location_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (
  id uuid,
  location_id uuid,
  location_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  slot_count integer,
  booking_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select * from private.admin_create_availability_at(now(), p_location_id, p_starts_at, p_ends_at);
end;
$$;
revoke all on function public.admin_create_availability(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_create_availability(uuid, timestamptz, timestamptz)
  to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Suppression. Refusée dès qu'une réservation CONFIRMÉE du lieu touche la plage, passée ou
--    future (le trigger availabilities_before_change ne regarde que le futur) : aucune
--    réservation ne se retrouve hors plage en silence. Les RDV ne sont jamais modifiés ici ;
--    le barber annule d'abord ceux qui doivent l'être. Les RDV annulés ne bloquent pas : ils ne
--    référencent pas la plage (le lieu est copié dans bookings.location_id).
-- -----------------------------------------------------------------------------
create function public.admin_delete_availability(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.availabilities%rowtype;
begin
  perform private.require_admin();
  if p_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking:slots', 0));

  select * into v_row from public.availabilities a where a.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if private.availability_booking_count(v_row.location_id, v_row.starts_at, v_row.ends_at) > 0 then
    raise exception 'availability_has_bookings' using errcode = 'P0001';
  end if;

  delete from public.availabilities a where a.id = p_id;
end;
$$;
revoke all on function public.admin_delete_availability(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_availability(uuid) to authenticated;
