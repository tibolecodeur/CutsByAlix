-- =============================================================================
-- Jours disponibles (consigne 25 bis, issue #40). Voir docs/adr/0010.
--
-- Le calendrier de /reserver grise les jours sans créneau. Il lui faut, pour les 4 semaines,
-- les jours qui ont au moins un créneau et leur nombre de créneaux : UNE requête, au lieu de
-- 28 appels à get_available_slots (un par jour).
--   1. private.get_available_days_at(p_now, p_service_id) : la logique, testable à date fixe.
--   2. public.get_available_days(p_service_id) : l'enveloppe appelée par le site.
-- Rien n'est recopié : chaque jour passe par private.compute_slots, la fonction qui produit
-- déjà la liste des créneaux (lieux actifs, délai minimum, horizon, grille de 70 min, RDV
-- confirmés retirés, prestation inactive ou inconnue = aucun créneau). Un jour est donc
-- « disponible » exactement quand get_available_slots lui renverrait au moins une ligne.
-- get_available_slots n'est pas modifiée. Lecture seule : aucune écriture, aucune donnée client.
-- Idempotente : rejouée, elle ne fait rien de plus.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Logique. Les jours sont ceux de Paris : le premier est celui de « maintenant », le
--    dernier celui de l'horizon de réservation (private.max_booking_time). La boucle est sur
--    un ENTIER ajouté à une date : generate_series sur des dates passerait par le fuseau de la
--    session et pourrait décaler un jour. Chaque jour est rangé par compute_slots, qui borne
--    le jour de Paris en heures absolues (le changement d'heure est déjà géré là).
--    Un p_now ou un p_service_id null ne donne aucune ligne.
-- -----------------------------------------------------------------------------
create or replace function private.get_available_days_at(
  p_now timestamptz,
  p_service_id uuid
)
returns table (
  day date,
  slot_count integer
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select (p_now at time zone 'Europe/Paris')::date as first_day,
           (private.max_booking_time(p_now) at time zone 'Europe/Paris')::date as last_day
  )
  select (b.first_day + g.n)::date as day,
         count(*)::integer as slot_count
    from bounds b
   cross join lateral generate_series(0, b.last_day - b.first_day) as g (n)
   cross join lateral private.compute_slots(p_service_id, (b.first_day + g.n)::date, p_now) c
   group by 1
   order by 1;
$$;
revoke all on function private.get_available_days_at(timestamptz, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Fonction publique. security definer : le public (anon) ne lit jamais les tables, il passe
--    par cette fonction. Elle ne renvoie que des jours et des nombres : rien que le client ne
--    puisse déjà obtenir en appelant get_available_slots jour par jour.
-- -----------------------------------------------------------------------------
create or replace function public.get_available_days(p_service_id uuid)
returns table (
  day date,
  slot_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.day, d.slot_count
    from private.get_available_days_at(now(), p_service_id) d;
$$;
revoke all on function public.get_available_days(uuid) from public, anon, authenticated;
grant execute on function public.get_available_days(uuid) to anon;
