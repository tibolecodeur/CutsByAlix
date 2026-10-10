-- =============================================================================
-- Annulation par lien (consigne 16) : get_booking et cancel_booking testables à date fixe.
--   1. La logique passe dans private.get_booking_at(p_now, …) et
--      private.cancel_booking_at(p_now, …), sans aucun droit : les RPC publiques les appellent
--      avec now(). Même principe que private.create_booking_at.
--   2. Un lien « expiré » (RDV terminé) se comporte comme un lien inexistant : get_booking ne
--      renvoie aucune ligne, cancel_booking renvoie false (au lieu de too_late). Le porteur
--      d'un vieux lien n'apprend rien de plus qu'avec un jeton inconnu.
-- Signatures et types de retour des RPC publiques inchangés (create or replace suffit).
-- Inchangé : 24 h en heures absolues, verrou de ligne, erreur too_late.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- get_booking : récap pour le porteur du lien.
--   · mauvais token, token null ou RDV terminé (ends_at <= p_now) → aucune ligne ;
--   · jamais d'adresse privée, de téléphone, d'email, de nom de famille ni d'identifiant
--     (le lien peut avoir été transféré) ; le prénom sert à s'adresser au client ;
--   · can_cancel : RDV confirmé ET p_now <= début - cancel_notice (24 h, heures absolues).
-- -----------------------------------------------------------------------------
create function private.get_booking_at(p_now timestamptz, p_token uuid)
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
set search_path = ''
as $$
  select b.status,
         b.starts_at,
         b.ends_at,
         s.name,
         l.public_label,
         b.first_name,
         (b.status = 'confirmed' and p_now <= b.starts_at - cfg.cancel_notice)
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

create or replace function public.get_booking(p_token uuid)
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
  select g.status, g.starts_at, g.ends_at, g.service_name, g.location_label, g.first_name,
         g.can_cancel
    from private.get_booking_at(now(), p_token) g;
$$;

-- -----------------------------------------------------------------------------
-- cancel_booking : annule si le délai le permet.
--   true  → annulé ;
--   false → token inconnu ou null, RDV déjà annulé, ou RDV terminé : même réponse, aucune
--           information ne fuit (un rejeu après coupure réseau renvoie aussi false) ;
--   erreur too_late → RDV pas encore terminé mais à moins de cancel_notice de son début.
-- Le verrou de ligne (for update) sérialise deux annulations simultanées : la seconde voit le
-- statut « cancelled » et renvoie false.
-- Effets : le créneau est libéré (compute_slots et la contrainte d'exclusion ne regardent que
-- les RDV confirmés) et le RDV ne compte plus dans la limite de RDV futurs du contact.
-- -----------------------------------------------------------------------------
create function private.cancel_booking_at(p_now timestamptz, p_token uuid)
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

  update public.bookings set status = 'cancelled' where id = v_booking.id;
  return true;
end;
$$;
revoke all on function private.cancel_booking_at(timestamptz, uuid)
  from public, anon, authenticated;

create or replace function public.cancel_booking(p_token uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.cancel_booking_at(now(), p_token);
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution, réécrits explicitement : uniquement anon (le client public, sans
-- session) pour les deux RPC ; personne pour les fonctions privées.
-- -----------------------------------------------------------------------------
revoke all on function public.get_booking(uuid) from public, anon, authenticated;
revoke all on function public.cancel_booking(uuid) from public, anon, authenticated;
grant execute on function public.get_booking(uuid) to anon;
grant execute on function public.cancel_booking(uuid) to anon;
