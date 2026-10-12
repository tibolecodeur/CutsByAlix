-- Contrôle de la migration 20261012184415_jours_disponibles.sql (consigne 25 bis, ADR 0010).
-- LECTURE SEULE : une seule requête sur le catalogue, aucune donnée client lue, aucune écriture.
-- À coller dans le SQL Editor de Supabase APRÈS `npx supabase db push`, avant de fusionner la PR.
-- Résultat attendu : la colonne « verdict » vaut OK sur toutes les lignes. Une ligne « ERREUR »
-- signale ce qui manque (avant la migration, elle en signale plusieurs, c'est normal).
with fns as (
  select n.nspname || '.' || p.proname as nom, p.oid, p.prosecdef, p.provolatile, p.proconfig,
         pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (('public', 'get_available_days'),
                                    ('private', 'get_available_days_at'))
)
select '1. présence' as controle, nom || '(' || args || ')' as detail,
       case when count(*) over (partition by nom) = 1 then 'OK' else 'ERREUR : surcharges' end as verdict
  from fns
union all
select '1. présence', 'public.get_available_days et private.get_available_days_at',
       case when (select count(*) from fns) = 2 then 'OK' else 'ERREUR : fonction absente' end
union all
select '2. forme', 'public.get_available_days renvoie TABLE(day date, slot_count integer)',
       case when pg_get_function_result(to_regprocedure('public.get_available_days(uuid)'))
                 = 'TABLE(day date, slot_count integer)'
            then 'OK' else 'ERREUR : fonction absente ou forme inattendue' end
union all
select '3. ' || nom, 'lecture seule (stable), search_path vide',
       case when provolatile = 's' and proconfig @> array['search_path=""']
            then 'OK' else 'ERREUR : volatilité ou search_path' end
  from fns
union all
select '3. public.get_available_days', 'security definer',
       case when exists (select 1 from fns where nom = 'public.get_available_days' and prosecdef)
            then 'OK' else 'ERREUR : pas security definer' end
union all
select '4. droit d''exécution ' || r.role, 'public.get_available_days',
       case when coalesce(has_function_privilege(r.role,
              to_regprocedure('public.get_available_days(uuid)'), 'execute'), false) = (r.role = 'anon')
            then 'OK' else 'ERREUR : droit inattendu' end
  from (values ('anon'), ('authenticated')) as r(role)
union all
select '4. droit d''exécution ' || r.role, 'private.get_available_days_at (aucun droit attendu)',
       case when coalesce(has_function_privilege(r.role,
              to_regprocedure('private.get_available_days_at(timestamptz,uuid)'), 'execute'), false)
            then 'ERREUR : droit inattendu' else 'OK : refusé' end
  from (values ('anon'), ('authenticated')) as r(role)
order by 1, 2;
