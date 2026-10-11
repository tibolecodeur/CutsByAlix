-- =============================================================================
-- Délai minimum de réservation : 48 h → 5 h (consigne 21, issue #30).
--
-- Seule la valeur `min_notice` de private.settings() change. Le délai d'annulation (24 h),
-- les 70 min, les 28 jours, les 2 RDV, les 6 mois et gallery_max_items (60) sont repris tels
-- quels de 20261011114540_admin_galerie.sql. Même signature de retour : `create or replace`
-- suffit, aucune fonction n'est à recréer (elles relisent settings() par son nom).
-- Aucune donnée n'est modifiée.
-- =============================================================================

create or replace function private.settings()
returns table (
  slot_step interval,            -- pas de la grille de créneaux (part du début de chaque dispo)
  min_notice interval,           -- délai minimum entre maintenant et le début du RDV
  max_advance interval,          -- horizon maximum de réservation
  cancel_notice interval,        -- annulation client possible jusqu'à X avant le RDV
  max_future_bookings integer,   -- RDV futurs max par téléphone ou par email
  data_retention interval,       -- conservation des données clients après le RDV (purge à coder)
  gallery_max_items integer      -- photos max dans la galerie (publiées ou non)
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
    60;
$$;
revoke all on function private.settings() from public, anon, authenticated;
