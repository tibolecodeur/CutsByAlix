-- =============================================================================
-- Données de DÉVELOPPEMENT LOCAL uniquement. NE JAMAIS lancer ce fichier sur le projet
-- distant.
--
-- Volontairement ABSENT de config.toml ([db.seed] sql_paths) : `supabase db push
-- --include-seed` ne peut donc pas l'embarquer. En local, on le demande explicitement :
--   npm run db:reset:dev
-- (= supabase db reset --local, puis seed.sql et ce fichier).
-- Relançable : rien n'est ajouté en double.
-- =============================================================================

-- Garde : ce fichier active les lieux de seed.sql et leur ajoute des dispos. Lancé par
-- erreur sur le distant, il ouvrirait des créneaux réservables. On s'arrête dès que la base
-- ne ressemble pas à une base locale neuve : un compte (admin ou non), un RDV ou un lieu
-- inconnu de seed.sql (anciens lieux de production).
do $$
begin
  if exists (select 1 from auth.users)
     or exists (select 1 from public.admins)
     or exists (select 1 from public.bookings)
     or exists (
       select 1 from public.locations
       where id not in ('a11ce000-0000-4000-8000-000000000101',
                        'a11ce000-0000-4000-8000-000000000102')
     )
  then
    raise exception 'seed-dev.sql : base non vierge (probablement le projet distant). Abandon.';
  end if;
end $$;

-- seed.sql crée les lieux inactifs : on les active ici pour que le parcours de réservation
-- propose des créneaux en local.
update public.locations
set active = true
where id in ('a11ce000-0000-4000-8000-000000000101', 'a11ce000-0000-4000-8000-000000000102');

-- Disponibilités de test : les 7 prochains jours, 14 h–18 h heure de Paris, en alternant
-- les deux lieux de seed.sql. Calculées à partir de la date du jour pour rester « à venir ».
-- Une plage qui en chevaucherait une existante est sautée (contrainte d'exclusion).
insert into public.availabilities (location_id, starts_at, ends_at)
select slot.location_id, slot.starts_at, slot.ends_at
from (
  select
    case when d % 2 = 0
      then 'a11ce000-0000-4000-8000-000000000101'::uuid  -- Les Ponts-de-Cé
      else 'a11ce000-0000-4000-8000-000000000102'::uuid  -- Saint-Christophe-du-Bois
    end as location_id,
    (((now() at time zone 'Europe/Paris')::date + d) + time '14:00') at time zone 'Europe/Paris'
      as starts_at,
    (((now() at time zone 'Europe/Paris')::date + d) + time '18:00') at time zone 'Europe/Paris'
      as ends_at
  from generate_series(1, 7) as d
) as slot
where not exists (
  select 1 from public.availabilities a
  where tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(slot.starts_at, slot.ends_at, '[)')
);
