-- =============================================================================
-- Tarifs et durées affichés (consigne 26).
--
--   Coupe         : 60 min, 10 €     (affichage)
--   Coupe + barbe : 70 min, 12 €     (inchangé)
--
-- Les créneaux restent de 70 min pour toutes les prestations (la marge de 10 min de la coupe
-- simple est voulue). Jusqu'ici la fin d'un RDV venait de services.duration_min ; passer
-- « Coupe » à 60 min aurait raccourci ses RDV. private.bookings_before_write() lit donc
-- maintenant la durée du CRÉNEAU (private.settings().slot_step, 70 min) pour toutes les
-- prestations, et private.compute_slots() fait de même pour la fin d'un créneau proposé (sinon le
-- récapitulatif afficherait 14 h – 15 h et la confirmation 14 h – 15 h 10). Comportement
-- inchangé aujourd'hui (les deux prestations durent 70 min en production). La grille de
-- créneaux, la contrainte d'exclusion et private.settings() ne bougent pas.
--
-- Les réservations existantes gardent leur ends_at stocké (le trigger ne recalcule que si
-- starts_at ou service_id change). Les prestations sont retrouvées par leur NOM : ni id modifié,
-- ni insertion. Rejouable sans effet ; échoue clairement si une prestation attendue manque.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger bookings : ends_at = début + durée du créneau (corps repris de …_tables.sql,
--    seule la ligne du calcul change).
-- -----------------------------------------------------------------------------
create or replace function private.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ends_at n'est jamais fourni par le client : il découle de la durée du créneau.
  if tg_op = 'INSERT'
     or new.starts_at is distinct from old.starts_at
     or new.service_id is distinct from old.service_id then
    -- La prestation doit exister ; sa durée affichée n'intervient pas dans la fin du RDV.
    perform 1 from public.services s where s.id = new.service_id;
    if not found then
      raise exception 'invalid_input' using errcode = 'P0001';
    end if;
    new.ends_at := new.starts_at + (select c.slot_step from private.settings() c);
  elsif new.ends_at is distinct from old.ends_at then
    -- ends_at ne se modifie jamais à la main.
    new.ends_at := old.ends_at;
  end if;

  -- Un RDV confirmé doit tomber entièrement dans une dispo dont le lieu est celui du RDV.
  -- Vérifié seulement si le créneau, le lieu ou le statut change (corriger le nom d'un
  -- ancien RDV reste possible même si sa dispo a été supprimée depuis).
  if new.status = 'confirmed' and (
       tg_op = 'INSERT'
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.location_id is distinct from old.location_id
       or new.status is distinct from old.status) then
    -- FOR SHARE : une suppression concurrente de la dispo attend la fin de cette transaction.
    perform 1
      from public.availabilities a
     where a.location_id = new.location_id
       and a.starts_at <= new.starts_at
       and a.ends_at >= new.ends_at
       for share;
    if not found then
      raise exception 'outside_availability' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.bookings_before_write() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. compute_slots : même corps que …_fonctions_rpc.sql, mais la durée d'un créneau est
--    slot_step et non la durée de la prestation (seul le CTE `service` change).
-- -----------------------------------------------------------------------------
create or replace function private.compute_slots(
  p_service_id uuid,
  p_day date,
  p_now timestamptz
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  location_id uuid,
  location_label text
)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select * from private.settings()
  ),
  service as (
    -- La prestation doit exister et être active ; la durée d'un créneau vient de la config.
    select c.slot_step as duration
      from public.services s
     cross join cfg c
     where s.id = p_service_id
       and s.active
  ),
  bounds as (
    select (p_day::timestamp at time zone 'Europe/Paris') as day_start,
           ((p_day + 1)::timestamp at time zone 'Europe/Paris') as day_end
  )
  select g.slot_start,
         g.slot_start + service.duration,
         l.id,
         l.public_label
    from service
   cross join cfg
   cross join bounds
    join public.availabilities a
      on a.starts_at < bounds.day_end
     and a.ends_at > bounds.day_start
    join public.locations l
      on l.id = a.location_id
     and l.active
   cross join lateral generate_series(
           a.starts_at, a.ends_at - service.duration, cfg.slot_step
         ) as g (slot_start)
   where g.slot_start >= bounds.day_start
     and g.slot_start < bounds.day_end
     and g.slot_start >= p_now + cfg.min_notice
     and g.slot_start <= private.max_booking_time(p_now)
     and not exists (
           select 1
             from public.bookings b
            where b.status = 'confirmed'
              and tstzrange(b.starts_at, b.ends_at, '[)')
                  && tstzrange(g.slot_start, g.slot_start + service.duration, '[)')
         )
   order by g.slot_start;
$$;
revoke all on function private.compute_slots(uuid, date, timestamptz)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Données : durées et prix affichés. Mise à jour par nom, jamais d'insertion.
--    Table vide (base neuve, locale ou CI : les migrations passent AVANT supabase/seed.sql,
--    qui pose déjà les bonnes valeurs) : rien à faire. Table non vide mais prestation attendue
--    absente (renommée, supprimée) : la migration échoue et ne modifie rien.
-- -----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  if not exists (select 1 from public.services) then
    raise notice 'Aucune prestation : rien à mettre à jour (supabase/seed.sql les crée).';
    return;
  end if;

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
$$;
