-- =============================================================================
-- Données de départ, à lancer À LA MAIN dans le SQL Editor de Supabase (projet distant).
-- Aussi appliqué en local par `supabase db reset` (config.toml). seed-dev.sql n'est jamais
-- dans config.toml : voir son en-tête.
--
-- Relançable sans risque (idempotent) : une ligne n'est ajoutée que si elle n'existe pas
-- déjà (même id, même nom de prestation ou même libellé de lieu). Rien n'est jamais modifié
-- ni supprimé : les prestations modifiées depuis l'admin ou les lieux activés ne sont pas
-- écrasés par une nouvelle exécution. Attention : une ligne SUPPRIMÉE
-- serait recréée (la masquer plutôt que la supprimer, ou ne plus relancer ce script).
--
-- Aucune adresse, nulle part : le site ne stocke que la localité (ADR 0008).
-- Contraintes respectées (migration …_tables.sql) : textes sans espace au bord ; nom et
-- libellé de 1 à 80 caractères ; durée entre 15 et 240 min, multiple de 5 ; prix affiché en
-- texte (pas de centimes), 40 caractères max.
-- =============================================================================

begin;

-- Prestations : 70 min, 12 € chacune.
insert into public.services (id, name, duration_min, price_label, active, sort_order)
select v.id, v.name, v.duration_min, v.price_label, true, v.sort_order
from (
  values
    -- NOM À CONFIRMER AVEC ALIX
    ('a11ce000-0000-4000-8000-000000000001'::uuid, 'Coupe', 70, '12 €', 1),
    -- NOM À CONFIRMER AVEC ALIX
    ('a11ce000-0000-4000-8000-000000000002'::uuid, 'Coupe + barbe', 70, '12 €', 2)
) as v (id, name, duration_min, price_label, sort_order)
where not exists (
  select 1 from public.services s where s.id = v.id or s.name = v.name
);

-- Lieux : la localité, visible de tous. Aucune adresse (ADR 0008) : le client la demande à
-- Alix sur Instagram. Créés INACTIFS : un lieu inactif ne propose aucun créneau
-- (private.compute_slots filtre sur l.active). L'activation est une décision de mise en
-- ligne, faite dans le SQL Editor (jamais dans ce fichier) :
--   update public.locations set active = true where id = '…';
-- Le lieu …101 s'appelait « Angers » : la migration …_lieux_sans_adresse.sql le renomme. Ici,
-- la correspondance sur l'id évite de le recréer sous son nouveau nom.
--
-- Les lieux d'un ancien seed (« Chez ses parents », « Chez lui », désactivés en production)
-- ne sont ni réactivés ni recréés : ce script n'insère que les deux lieux ci-dessous et ne
-- fait jamais d'update ni de delete.
insert into public.locations (id, public_label, active, sort_order)
select v.id, v.public_label, false, v.sort_order
from (
  values
    ('a11ce000-0000-4000-8000-000000000101'::uuid, 'Les Ponts-de-Cé', 1),
    ('a11ce000-0000-4000-8000-000000000102'::uuid, 'Saint-Christophe-du-Bois', 2)
) as v (id, public_label, sort_order)
where not exists (
  select 1 from public.locations l where l.id = v.id or l.public_label = v.public_label
);

commit;
