-- =============================================================================
-- Purge RGPD des données clients (K-03 de l'audit, bloquant pour la mise en ligne).
-- Décision de Thibault du 2026-11-25 : conservation 8 MOIS après le RDV (au lieu de 6), puis
-- SUPPRESSION de la réservation entière (confirmée ou annulée). Voir docs/adr/0013.
--
--   1. private.settings() : seule `data_retention` change (6 → 8 mois). Même signature (10
--      colonnes) : `create or replace` suffit, les autres valeurs sont reprises telles quelles
--      de 20261030090000_notifications_push.sql, la définition en vigueur.
--   2. private.purge_expired_bookings_at(p_now) : supprime les réservations dont la FIN est
--      plus vieille que p_now - data_retention ; renvoie le nombre de lignes supprimées.
--      « Maintenant » en paramètre : testable à date fixe (comme create_booking_at).
--   3. private.purge_expired_bookings() : la même à now(), appelée par pg_cron.
--   4. pg_cron : chaque nuit à 3 h 17 UTC. Rejouable : même nom de job = remplacement.
--
-- Seule la table bookings contient des données clients (prénom, nom, téléphone, e-mail,
-- jeton). Aucune table ne la référence (pas de clé étrangère vers bookings). private.notify_log
-- ne garde que le type d'évènement et se vide déjà au bout d'un jour. Le trigger
-- bookings_notify n'écoute que insert / update : la purge n'envoie aucune notification.
--
-- Aucun droit pour anon ni authenticated : ces fonctions ne sont pas exposées par l'API.
-- =============================================================================

create or replace function private.settings()
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
  push_max_per_hour integer       -- notifications envoyées au plus par heure (anti-abus)
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
    10;
$$;
revoke all on function private.settings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Purge à une date donnée. Repère : la FIN du RDV (ends_at), confirmé ou annulé. Un RDV
-- annulé longtemps à l'avance garde donc ses données jusqu'à 8 mois après la date prévue :
-- règle unique, simple à expliquer (« 8 mois après la date du rendez-vous »).
-- -----------------------------------------------------------------------------
create function private.purge_expired_bookings_at(p_now timestamptz)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_now is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  delete from public.bookings b
   where b.ends_at < p_now - (select c.data_retention from private.settings() c);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.purge_expired_bookings_at(timestamptz)
  from public, anon, authenticated;

-- Point d'entrée de pg_cron (horloge réelle). security definer : la suppression se fait avec
-- les droits du propriétaire, quel que soit le rôle qui exécute le job.
create function private.purge_expired_bookings()
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.purge_expired_bookings_at(now());
$$;
revoke all on function private.purge_expired_bookings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Planification. Sur Supabase, pg_cron s'installe dans pg_catalog (schéma `cron` pour ses
-- tables). Heure creuse, minute non ronde (évite l'heure pile, chargée sur la plateforme).
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-donnees-clients',
  '17 3 * * *',
  'select private.purge_expired_bookings()'
);
