-- =============================================================================
-- Branchement du front sur les RPC de créneaux et de réservation (consigne 15).
--   1. get_available_slots renvoie aussi location_id (le front l'envoie à create_booking).
--   2. create_booking reçoit p_location_id et ne renvoie PLUS l'adresse privée ; sa logique
--      passe dans private.create_booking_at(p_now, …) pour être testée à date fixe.
--      Nouveau : verrou consultatif global sur la prise de créneau, bornes de longueur des
--      entrées brutes avant toute regex.
--   3. get_booking ne renvoie plus l'adresse privée (règle de révélation à décider).
--   4. Les 4 RPC publiques ne sont plus exécutables que par anon (le client public n'a
--      jamais de session ; l'admin n'en a pas besoin).
-- Changement de type de retour ou de signature : drop puis create (create or replace ne
-- le permet pas), puis REVOKE / GRANT explicites.
-- Erreurs : mêmes clés P0001 qu'avant (invalid_input · slot_unavailable · too_soon ·
-- too_far · limit_reached · too_late).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. get_available_slots : + location_id. Toujours jamais d'adresse privée.
--    compute_slots fait tout le filtrage : lieux actifs, ≥ min_notice, ≤ max_advance (heure
--    de Paris), grille slot_step depuis le début de chaque dispo, RDV confirmés exclus.
-- -----------------------------------------------------------------------------
drop function if exists public.get_available_slots(uuid, date);

create function public.get_available_slots(p_service_id uuid, p_day date)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  location_id uuid,
  location_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.starts_at, c.ends_at, c.location_id, c.location_label
    from private.compute_slots(p_service_id, p_day, now()) c;
$$;

-- -----------------------------------------------------------------------------
-- 2. Réservation. Toute la logique est ici, avec « maintenant » injecté (p_now) : les tests
--    vérifient les limites (47 h 59 / 48 h, horizon au changement d'heure) à date fixe.
--    Aucun droit d'exécution : seule public.create_booking l'appelle, avec now().
-- -----------------------------------------------------------------------------
create function private.create_booking_at(
  p_now timestamptz,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_location_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_website text
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  cancel_token uuid
)
language plpgsql
volatile
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cfg record;
  v_first text;
  v_last text;
  v_phone text;
  v_email text;
  v_service_name text;
  v_count integer;
  v_booking public.bookings%rowtype;
begin
  -- 1. Bornes brutes, AVANT toute regex : une chaîne énorme ne doit rien coûter à la base.
  --    Larges exprès (espaces de saisie compris) : les vraies limites sont vérifiées à
  --    l'étape 3, après nettoyage.
  if char_length(p_first_name) > 200
     or char_length(p_last_name) > 200
     or char_length(p_phone) > 40
     or char_length(p_email) > 320
     or char_length(p_website) > 200
  then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- 2. Honeypot : un humain ne voit pas ce champ, il reste vide.
  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- 3. Normalisation (inchangée) : un numéro n'a qu'une seule écriture.
  --    On retire espaces, points, tirets, parenthèses et barres ; 00 devient + ;
  --    +33 6… devient 06… Tout le reste (ex. « +06… », 9 chiffres) est refusé ensuite.
  v_first := btrim(p_first_name);
  v_last := btrim(p_last_name);
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[[:space:].()/-]', '', 'g'), '');
  v_phone := regexp_replace(v_phone, '^00', '+');
  v_phone := regexp_replace(v_phone, '^\+33([1-9][0-9]{8})$', '0\1');

  --    Validation de toutes les entrées (mêmes règles que les contraintes de la table).
  if p_now is null
     or p_service_id is null
     or p_starts_at is null
     or p_location_id is null
     or v_first is null or char_length(v_first) not between 1 and 50
     or not private.is_safe_text(v_first) or v_first ~ '='
     or v_last is null or char_length(v_last) not between 1 and 50
     or not private.is_safe_text(v_last) or v_last ~ '='
     or (v_phone is null and v_email is null)
     or (v_phone is not null and (
           v_phone !~ '^(0[1-9][0-9]{8}|\+[1-9][0-9]{7,14})$' or v_phone ~ '^\+33'))
     or (v_email is not null and (
           char_length(v_email) > 254
           or not private.is_safe_text(v_email)
           or v_email !~ '^[^@[:space:]<>"]+@[^@[:space:]<>"]+\.[^@[:space:]<>"]+$'))
  then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select s.name into v_service_name
    from public.services s
   where s.id = p_service_id and s.active;
  if not found then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- 4. Fenêtre de réservation.
  select * into v_cfg from private.settings();
  if p_starts_at < p_now + v_cfg.min_notice then
    raise exception 'too_soon' using errcode = 'P0001';
  end if;
  if p_starts_at > private.max_booking_time(p_now) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  -- 5. Verrou consultatif global, gardé jusqu'à la fin de la transaction : deux réservations
  --    simultanées passent l'une APRÈS l'autre dans « vérifier le créneau → insérer ». La
  --    seconde voit donc le RDV de la première et reçoit slot_unavailable. La contrainte
  --    d'exclusion (étape 8) reste le filet de sécurité, y compris pour l'admin.
  --    Un seul verrou pour tout le site : quelques réservations par jour, attente nulle.
  perform pg_advisory_xact_lock(hashtextextended('booking:slots', 0));

  -- 6. Le créneau doit être exactement l'un de ceux que propose get_available_slots
  --    (lieu actif, dans une dispo, sur la grille, libre), ET dans le lieu que le client a vu :
  --    si le barber a déplacé la dispo entre-temps, le client ne réserve pas un autre lieu.
  if not exists (
    select 1
      from private.compute_slots(
             p_service_id, (p_starts_at at time zone 'Europe/Paris')::date, p_now
           ) c
     where c.starts_at = p_starts_at
       and c.location_id = p_location_id
  ) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  -- 7. Anti-abus : au plus N RDV futurs par téléphone ou par email (inchangé).
  --    Verrous par contact gardés tels quels (ordre fixe : global, téléphone, email ; pas
  --    d'interblocage possible). Le verrou global suffit aujourd'hui ; ceux-ci protègent la
  --    limite si l'étape 5 change un jour.
  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtextextended('booking:phone:' || v_phone, 0));
  end if;
  --    Pour l'email, on compare sans le suffixe « +… » (zoe+1@x.fr = zoe@x.fr). L'email est
  --    stocké tel que saisi.
  if v_email is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'booking:email:' || regexp_replace(v_email, '\+[^@]*@', '@'), 0));
  end if;

  select count(*) into v_count
    from public.bookings b
   where b.status = 'confirmed'
     and b.starts_at > p_now
     and ((v_phone is not null and b.phone = v_phone)
          or (v_email is not null
              and regexp_replace(b.email, '\+[^@]*@', '@')
                  = regexp_replace(v_email, '\+[^@]*@', '@')));
  if v_count >= v_cfg.max_future_bookings then
    raise exception 'limit_reached' using errcode = 'P0001';
  end if;

  -- 8. Insertion (ends_at calculé par le trigger). Collision malgré tout (exclusion) ou
  --    dispo supprimée entre-temps (trigger) : une seule clé pour le front.
  begin
    insert into public.bookings
      (service_id, location_id, starts_at, first_name, last_name, phone, email)
    values
      (p_service_id, p_location_id, p_starts_at, v_first, v_last, v_phone, v_email)
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    when raise_exception then
      if sqlerrm = 'outside_availability' then
        raise exception 'slot_unavailable' using errcode = 'P0001';
      end if;
      raise;
  end;

  -- 9. Récap : libellé public seulement, jamais l'adresse privée (règle de révélation à
  --    décider, voir docs/PLAN.md). Le cancel_token n'est renvoyé QU'ICI, une seule fois.
  return query
    select v_booking.starts_at,
           v_booking.ends_at,
           v_service_name,
           l.public_label,
           v_booking.cancel_token
      from public.locations l
     where l.id = v_booking.location_id;
end;
$$;
revoke all on function private.create_booking_at(
  timestamptz, uuid, timestamptz, uuid, text, text, text, text, text
) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_booking : la RPC publique. Le lieu est celui du créneau affiché (p_location_id) ;
-- ends_at est calculé par la base.
-- -----------------------------------------------------------------------------
drop function if exists public.create_booking(uuid, timestamptz, text, text, text, text, text);

create function public.create_booking(
  p_service_id uuid,
  p_starts_at timestamptz,
  p_location_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text default null,
  p_email text default null,
  p_website text default null  -- honeypot : champ invisible, rempli seulement par les robots
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  cancel_token uuid
)
language sql
volatile
security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at, b.service_name, b.location_label, b.cancel_token
    from private.create_booking_at(
           now(), p_service_id, p_starts_at, p_location_id,
           p_first_name, p_last_name, p_phone, p_email, p_website
         ) b;
$$;

-- -----------------------------------------------------------------------------
-- 3. get_booking : récap pour le porteur du lien. Plus d'adresse privée (règle de
--    révélation à décider) ; ni nom, ni téléphone, ni email (le lien peut avoir été
--    transféré). Le prénom reste : la page /annuler s'adresse au client par son prénom.
--    Mauvais token → aucune ligne (rien ne fuit).
-- -----------------------------------------------------------------------------
drop function if exists public.get_booking(uuid);

create function public.get_booking(p_token uuid)
returns table (
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  first_name text,
  can_cancel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.status,
         b.starts_at,
         b.ends_at,
         s.name,
         l.public_label,
         b.first_name,
         (b.status = 'confirmed' and now() <= b.starts_at - cfg.cancel_notice)
    from public.bookings b
    join public.services s on s.id = b.service_id
    join public.locations l on l.id = b.location_id
   cross join private.settings() cfg
   where p_token is not null
     and b.cancel_token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- 4. Droits d'exécution : uniquement anon (le client public, sans session). authenticated
--    (l'admin) passe par ses propres droits sur les tables. PUBLIC n'a rien.
--    cancel_booking n'est pas recréée : seul son droit change.
-- -----------------------------------------------------------------------------
revoke all on function public.get_available_slots(uuid, date) from public, anon, authenticated;
revoke all on function public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_booking(uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;

grant execute on function public.get_available_slots(uuid, date) to anon;
grant execute on function public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text)
  to anon;
grant execute on function public.get_booking(uuid) to anon;
grant execute on function public.cancel_booking(uuid) to anon;
