-- =============================================================================
-- Lieux sans adresse (consigne 24, issue #35). Voir docs/adr/0008.
--
-- Décision d'Alix (2026-10-12) : le site ne stocke et n'affiche AUCUNE adresse. Le client voit
-- seulement la localité ; l'adresse exacte lui est donnée en message privé sur Instagram.
--   1. private.is_placeholder_address() : reconnaît les adresses PROVISOIRES (seeds).
--   2. Garde : la migration échoue si un lieu contient une vraie adresse (elle ne doit pas
--      disparaître en silence).
--   3. Suppression des deux contraintes liées à l'adresse, puis de la colonne private_address.
--   4. Lieu « Angers » renommé « Les Ponts-de-Cé » (même identifiant).
-- Droits : aucun GRANT à réécrire. Le droit de colonne d'authenticated portait sur
-- (id, public_label, active), jamais sur l'adresse ; anon n'a toujours aucun droit sur la table.
-- Aucune fonction ne lisait plus la colonne (vérifié en base : pg_proc.prosrc).
-- Les lieux restent INACTIFS : l'activation est une décision de mise en ligne.
-- Idempotente : rejouée, elle ne fait plus rien.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Adresse provisoire ? Mêmes valeurs que l'ancienne contrainte
--    locations_address_required_when_active (lettres seules, minuscules, collation ICU :
--    espaces, ponctuation et accents écrits en deux caractères ne changent rien ; un chiffre
--    rend la valeur NON provisoire), plus les valeurs factices des seeds : les deux adresses
--    exactes de l'ancien seed (peut-être encore en production sur les lieux inactifs « Chez
--    ses parents » et « Chez lui ») et « Adresse factice (dev local) » (seed-dev.sql).
--    Vide ou null : rien à perdre, donc provisoire.
--    Conservée après la migration pour que la garde soit testée en pgTAP
--    (supabase/tests/23_lieux_sans_adresse_test.sql). Aucun droit d'exécution.
-- -----------------------------------------------------------------------------
create or replace function private.is_placeholder_address(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
      or btrim(p_value) = ''
      -- Lettres seules, et AUCUN chiffre : « À RENSEIGNER 49130 » n'est pas provisoire.
      or (p_value !~ '[0-9]'
          and lower(regexp_replace(p_value collate "und-x-icu", '[^[:alpha:]]', '', 'g'))
              in ('àrenseigner', 'arenseigner', 'adresseréelle', 'adressereelle',
                  'adressefacticedevlocal'))
      -- Ancien seed : valeurs EXACTES (historique git), pas un simple suffixe.
      or btrim(p_value) in ('1 rue de l''Exemple, 00000 Villetest (adresse factice)',
                            '2 avenue Fictive, 00000 Villetest (adresse factice)');
$$;
revoke all on function private.is_placeholder_address(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Garde. Le message donne le LIBELLÉ du lieu, jamais l'adresse (elle finirait dans les
--    journaux de la CLI et de Supabase). La requête est dynamique : rejouée après la
--    suppression de la colonne, la migration ne doit pas échouer.
-- -----------------------------------------------------------------------------
do $$
declare
  v_label text;
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'locations'
       and column_name = 'private_address'
  ) then
    execute $q$
      select public_label
        from public.locations
       where not private.is_placeholder_address(private_address)
       order by public_label
       limit 1
    $q$ into v_label;

    if v_label is not null then
      raise exception 'lieux_sans_adresse : le lieu « % » contient une vraie adresse. '
        'Migration annulée : sauvegarde-la ailleurs, remets « À RENSEIGNER », puis relance.',
        v_label;
    end if;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Contraintes puis colonne.
-- -----------------------------------------------------------------------------
alter table public.locations drop constraint if exists locations_address_required_when_active;
alter table public.locations drop constraint if exists locations_private_address_check;
alter table public.locations drop column if exists private_address;

comment on table public.locations is
  'Lieux où le barber coupe : libellé public (la localité) uniquement. Aucune adresse stockée '
  '(ADR 0008) : le client la demande à Alix sur Instagram.';

-- -----------------------------------------------------------------------------
-- 4. Renommage, par identifiant (celui de supabase/seed.sql). Ne touche ni à active, ni à
--    Saint-Christophe-du-Bois, ni aux anciens lieux. Sans effet si déjà fait ou absent.
-- -----------------------------------------------------------------------------
update public.locations
   set public_label = 'Les Ponts-de-Cé'
 where id = 'a11ce000-0000-4000-8000-000000000101'
   and public_label = 'Angers';
