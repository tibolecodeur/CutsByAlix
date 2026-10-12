-- =============================================================================
-- Réservation idempotente (consigne 25, issue #37, constat C-05 de l'audit). Voir docs/adr/0009.
--
-- Problème : la réservation est enregistrée mais la réponse n'arrive pas au navigateur. Le
-- client réessaie et reçoit « créneau plus disponible »… pour SON propre rendez-vous, sans
-- lien d'annulation.
-- Solution : le navigateur tire une clé aléatoire (p_request_id) pour UNE réservation donnée
-- et la renvoie à chaque nouvel essai. Même clé + mêmes données, dans les 30 min qui suivent
-- la création : la base ne crée rien et renvoie le MÊME récapitulatif (même cancel_token,
-- stocké en clair : rien à régénérer). Sinon : request_conflict.
--   1. private.settings() : + request_replay_window (30 min).
--   2. bookings.request_key_hash : sha256 de la clé (jamais la clé), unique, sans aucun droit.
--   3. private.create_booking_at : + p_request_id ; created_at = p_now (dates fixes en test).
--   4. public.create_booking : + p_request_id DEFAULT NULL (l'ancien front marche encore).
-- Idempotente : rejouée, elle ne fait rien de plus.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Règles métier : mêmes valeurs qu'avant + request_replay_window. Aucune fonction n'en
--    dépend au sens de pg_depend (corps plpgsql / sql non « atomic ») : elles la relisent par
--    son nom, le drop ne casse rien.
-- -----------------------------------------------------------------------------
drop function if exists private.settings();
create function private.settings()
returns table (
  slot_step interval,            -- pas de la grille de créneaux (part du début de chaque dispo)
  min_notice interval,           -- délai minimum entre maintenant et le début du RDV
  max_advance interval,          -- horizon maximum de réservation
  cancel_notice interval,        -- annulation client possible jusqu'à X avant le RDV
  max_future_bookings integer,   -- RDV futurs max par téléphone ou par email
  data_retention interval,       -- conservation des données clients après le RDV (purge à coder)
  gallery_max_items integer,     -- photos max dans la galerie (publiées ou non)
  request_replay_window interval -- rejeu d'une réservation (même clé) accepté pendant X
)
language sql
stable
set search_path = ''
as $$
  select
    interval '70 minutes',
    interval '5 hours',
    interval '28 days',
    interval '24 hours',
    2,
    interval '6 months',
    60,
    interval '30 minutes';
$$;
revoke all on function private.settings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Empreinte de la clé d'idempotence. sha256 (intégré à PostgreSQL) : la clé elle-même
--    n'est jamais stockée. Aucun GRANT : ni anon ni authenticated ne lisent cette colonne
--    (bookings n'a de toute façon aucun droit direct, tout passe par les fonctions).
-- -----------------------------------------------------------------------------
alter table public.bookings add column if not exists request_key_hash bytea;
alter table public.bookings drop constraint if exists bookings_request_key_hash_check;
alter table public.bookings
  add constraint bookings_request_key_hash_check
  check (request_key_hash is null or octet_length(request_key_hash) = 32);
create unique index if not exists bookings_request_key_hash_key
  on public.bookings (request_key_hash)
  where request_key_hash is not null;

-- -----------------------------------------------------------------------------
-- 3. Logique de réservation, testable à date fixe. Inchangée sauf :
--    - étape 3 bis (nouvelle) : rejeu d'une clé déjà vue ;
--    - étape 8 : request_key_hash et created_at = p_now enregistrés.
--    p_request_id DEFAULT NULL : sans clé, comportement identique à avant (tests existants).
-- -----------------------------------------------------------------------------
drop function if exists private.create_booking_at(
  timestamptz, uuid, timestamptz, uuid, text, text, text, text, text);
drop function if exists private.create_booking_at(
  timestamptz, uuid, timestamptz, uuid, text, text, text, text, text, uuid);

create function private.create_booking_at(
  p_now timestamptz,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_location_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_website text,
  p_request_id uuid default null
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  cancel_token uuid
)
language plpgsql
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
  v_key_hash bytea;
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

  select * into v_cfg from private.settings();

  -- 3 bis. Rejeu (C-05). Le verrou global de l'étape 5 est pris DÈS MAINTENANT : deux envois
  --    simultanés avec la même clé passent l'un après l'autre, le second voit donc la ligne
  --    du premier. Le verrou est réentrant : le reprendre à l'étape 5 ne bloque rien.
  --    Le rejeu ne revérifie ni la fenêtre de réservation, ni le créneau, ni le plafond de
  --    RDV futurs : c'est le MÊME rendez-vous, il ne doit compter qu'une fois.
  if p_request_id is not null then
    v_key_hash := sha256(convert_to(p_request_id::text, 'UTF8'));
    perform pg_advisory_xact_lock(hashtextextended('booking:slots', 0));

    select * into v_booking
      from public.bookings b
     where b.request_key_hash = v_key_hash;

    if found then
      if v_booking.status = 'confirmed'
         and v_booking.service_id = p_service_id
         and v_booking.starts_at = p_starts_at
         and v_booking.location_id = p_location_id
         and v_booking.first_name = v_first
         and v_booking.last_name = v_last
         and v_booking.phone is not distinct from v_phone
         and v_booking.email is not distinct from v_email
         and p_now >= v_booking.created_at
         and p_now <= v_booking.created_at + v_cfg.request_replay_window
         -- RDV encore à venir : garde-fou si un jour min_notice devient plus court que
         -- request_replay_window (aujourd'hui 5 h contre 30 min, impossible).
         and v_booking.starts_at > p_now
      then
        -- Pas de filtre sur services.active : c'est le MÊME rendez-vous, même si la prestation
        -- a été désactivée entre-temps (le premier envoi l'avait acceptée).
        return query
          select v_booking.starts_at,
                 v_booking.ends_at,
                 s.name,
                 l.public_label,
                 v_booking.cancel_token
            from public.services s
            join public.locations l on l.id = v_booking.location_id
           where s.id = v_booking.service_id;
        return;
      end if;
      -- Même clé, autre chose (données, RDV annulé, fenêtre dépassée) : refusé, sans rien
      -- révéler de la réservation existante.
      raise exception 'request_conflict' using errcode = 'P0001';
    end if;
  end if;

  select s.name into v_service_name
    from public.services s
   where s.id = p_service_id and s.active;
  if not found then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- 4. Fenêtre de réservation.
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

  -- 8. Insertion (ends_at calculé par le trigger). created_at = p_now : la fenêtre de rejeu
  --    se calcule sur la même horloge que le reste (en production, p_now = now()).
  --    Collision malgré tout (exclusion) ou dispo supprimée entre-temps (trigger) : une seule
  --    clé pour le front. Clé déjà prise (impossible sous le verrou) : request_conflict.
  begin
    insert into public.bookings
      (service_id, location_id, starts_at, first_name, last_name, phone, email,
       request_key_hash, created_at)
    values
      (p_service_id, p_location_id, p_starts_at, v_first, v_last, v_phone, v_email,
       v_key_hash, p_now)
    returning * into v_booking;
  exception
    when exclusion_violation then
      raise exception 'slot_unavailable' using errcode = 'P0001';
    when unique_violation then
      raise exception 'request_conflict' using errcode = 'P0001';
    when raise_exception then
      if sqlerrm = 'outside_availability' then
        raise exception 'slot_unavailable' using errcode = 'P0001';
      end if;
      raise;
  end;

  -- 9. Récap : libellé public seulement (aucune adresse stockée, ADR 0008). Le cancel_token
  --    n'est renvoyé qu'ici, et lors d'un rejeu légitime (étape 3 bis).
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
  timestamptz, uuid, timestamptz, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Fonction publique : p_request_id en dernier, DEFAULT NULL. Un front qui ne l'envoie pas
--    (version en ligne avant ce déploiement) garde exactement le comportement d'avant.
-- -----------------------------------------------------------------------------
drop function if exists public.create_booking(uuid, timestamptz, uuid, text, text, text, text, text);
drop function if exists public.create_booking(
  uuid, timestamptz, uuid, text, text, text, text, text, uuid);

create function public.create_booking(
  p_service_id uuid,
  p_starts_at timestamptz,
  p_location_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_request_id uuid default null
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  service_name text,
  location_label text,
  cancel_token uuid
)
language sql
security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at, b.service_name, b.location_label, b.cancel_token
    from private.create_booking_at(
           now(), p_service_id, p_starts_at, p_location_id,
           p_first_name, p_last_name, p_phone, p_email, p_website, p_request_id
         ) b;
$$;
revoke all on function public.create_booking(
  uuid, timestamptz, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_booking(
  uuid, timestamptz, uuid, text, text, text, text, text, uuid)
  to anon;
