-- =============================================================================
-- Délai minimum de réservation : 5 h → 2 h (consigne 28).
--
-- Seule la valeur `min_notice` de private.settings() change. Toutes les autres valeurs
-- (70 min, 28 jours, annulation 24 h, 2 RDV, 6 mois, 60 photos, rejeu 30 min) et la signature
-- (8 colonnes) sont reprises telles quelles de 20261012161325_reservation_idempotente.sql, la
-- définition en vigueur. Même signature de retour : `create or replace` suffit, aucune fonction
-- n'est à recréer (elles relisent settings() par son nom). Aucune donnée n'est modifiée.
-- Le garde-fou de rejeu de create_booking (RDV encore à venir) reste valable : 2 h > 30 min.
-- À appliquer en production AVANT le déploiement du front (qui affiche « 2 h »).
-- =============================================================================

create or replace function private.settings()
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
    interval '2 hours',
    interval '28 days',
    interval '24 hours',
    2,
    interval '6 months',
    60,
    interval '30 minutes';
$$;
revoke all on function private.settings() from public, anon, authenticated;
