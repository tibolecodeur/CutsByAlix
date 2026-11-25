-- =============================================================================
-- Plafond global de réservations (K-02 a de l'audit, bloquant pour la mise en ligne).
-- Décision de Thibault du 2026-11-25 : au plus 6 réservations créées par heure et 20 par 24 h,
-- sur tout le site (ADR 0014), sans compter celles qu'Alix a annulées. Au-delà, create_booking refuse avec la clé stable
-- `rate_limited`. Un script qui invente des numéros ne peut donc plus prendre tous les
-- créneaux des 4 semaines d'un coup, et Alix est notifiée de chaque réservation (ADR 0012).
--
--   1. private.settings() : + max_bookings_per_hour (6), + max_bookings_per_day (20). Nouvelle
--      signature : drop + create, comme 20261030090000_notifications_push.sql (les fonctions
--      la relisent par son nom, aucune dépendance au sens de pg_depend). Toutes les autres
--      valeurs sont reprises de 20261125090000_purge_donnees_clients.sql (dont 8 mois).
--   2. private.create_booking_at : corps repris de 20261012161325_reservation_idempotente.sql,
--      un seul ajout (étape 5 bis), même signature. public.create_booking, qui l'appelle, et
--      ses droits ne changent pas.
--
-- Non réglé par ce plafond (risque accepté, ADR 0014) : réserver au nom d'un tiers pour
-- bloquer son numéro. Alix annule une fausse réservation depuis l'admin (consigne 19).
-- Aucune donnée n'est modifiée.
-- =============================================================================

drop function private.settings();
create function private.settings()
returns table (
  slot_step interval,             -- pas de la grille de créneaux (part du début de chaque dispo)
  min_notice interval,            -- délai minimum entre maintenant et le début du RDV
  max_advance interval,           -- horizon maximum de réservation
  cancel_notice interval,         -- annulation client possible jusqu'à X avant le RDV
  max_future_bookings integer,    -- RDV futurs max par téléphone ou par email
  data_retention interval,        -- conservation des données clients après la fin du RDV
  gallery_max_items integer,      -- photos max dans la galerie (publiées ou non)
  request_replay_window interval, -- rejeu d'une réservation (même clé) accepté pendant X
  push_max_devices integer,       -- appareils abonnés aux notifications, par admin
  push_max_per_hour integer,      -- notifications envoyées au plus par heure (anti-abus)
  max_bookings_per_hour integer,  -- réservations créées au plus par heure, tout le site
  max_bookings_per_day integer    -- réservations créées au plus par 24 h, tout le site
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
    interval '8 months',
    60,
    interval '30 minutes',
    5,
    10,
    6,
    20;
$$;
revoke all on function private.settings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- create_booking_at : ajout de l'étape 5 bis (plafond global), le reste est inchangé.
-- -----------------------------------------------------------------------------
create or replace function private.create_booking_at(
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

  -- 5 bis. Plafond global (K-02, ADR 0014) : au plus N réservations créées par heure et par
  --    24 h, sur tout le site. Les annulations du CLIENT comptent (une boucle « réserver puis
  --    annuler » ne contourne rien) ; celles d'ALIX non : annuler de fausses réservations
  --    depuis l'admin libère aussitôt le plafond pour les vrais clients.
  --    Sous le verrou global : deux envois simultanés ne peuvent pas dépasser le plafond.
  --    Le rejeu (3 bis) est traité avant : le MÊME rendez-vous ne compte qu'une fois.
  if (select count(*) from public.bookings b
       where b.created_at > p_now - interval '1 hour'
         and b.cancelled_by is distinct from 'barber') >= v_cfg.max_bookings_per_hour
     or (select count(*) from public.bookings b
          where b.created_at > p_now - interval '24 hours'
            and b.cancelled_by is distinct from 'barber') >= v_cfg.max_bookings_per_day
  then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

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
