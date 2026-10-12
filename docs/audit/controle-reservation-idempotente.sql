-- Contrôle de la migration 20261012161325_reservation_idempotente.sql (consigne 25, ADR 0009).
-- LECTURE SEULE : une seule requête sur le catalogue, aucune donnée client lue, aucune écriture.
-- À coller dans le SQL Editor de Supabase APRÈS `npx supabase db push`, avant de fusionner la PR.
-- Résultat attendu : la colonne « verdict » vaut OK sur toutes les lignes. Une ligne « ERREUR »
-- signale ce qui manque (avant la migration, elle en signale plusieurs, c'est normal).
with sigs as (
  select n.nspname || '.' || p.proname as nom,
         pg_get_function_identity_arguments(p.oid) as args,
         p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (('public', 'create_booking'), ('private', 'create_booking_at'))
)
select '1. signature' as controle,
       nom || '(' || args || ')' as detail,
       case when args like '%p_request_id uuid%' then 'OK' else 'ERREUR : ancienne signature' end as verdict
  from sigs
union all
select '1. nombre de versions', nom || ' : ' || count(*)::text,
       case when count(*) = 1 then 'OK' else 'ERREUR : plusieurs versions' end
  from sigs group by nom
union all
select '2. private.settings()',
       'request_replay_window présent dans le résultat de la fonction',
       case when pg_get_function_result('private.settings()'::regprocedure)
                 like '%request_replay_window interval%' then 'OK' else 'ERREUR : colonne absente' end
union all
select '2. valeur', coalesce((select to_jsonb(c)->>'request_replay_window' from private.settings() c), 'absente'),
       case when (select to_jsonb(c)->>'request_replay_window' from private.settings() c) = '00:30:00'
            then 'OK' else 'ERREUR : attendu 00:30:00' end
union all
select '3. colonne', 'public.bookings.request_key_hash',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'bookings'
                            and column_name = 'request_key_hash' and data_type = 'bytea')
            then 'OK' else 'ERREUR : colonne absente' end
union all
select '3. droit ' || r.role || ' ' || p.priv, 'sur request_key_hash',
       case when coalesce(has_column_privilege(r.role, 'public.bookings', 'request_key_hash', p.priv), false)
            then 'ERREUR : accès possible' else 'OK : refusé' end
  from (values ('anon'), ('authenticated')) as r(role)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE')) as p(priv)
 where exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'bookings'
                  and column_name = 'request_key_hash')
union all
select '3. unicité', 'index unique sur request_key_hash',
       case when exists (select 1 from pg_indexes
                          where schemaname = 'public' and tablename = 'bookings'
                            and indexname = 'bookings_request_key_hash_key')
            then 'OK' else 'ERREUR : index absent' end
union all
select '4. exécution ' || r.role,
       'public.create_booking (9 paramètres)',
       case when coalesce(has_function_privilege(r.role,
              to_regprocedure('public.create_booking(uuid,timestamptz,uuid,text,text,text,text,text,uuid)'),
              'execute'), false) = (r.role = 'anon')
            then 'OK' else 'ERREUR : droit inattendu' end
  from (values ('anon'), ('authenticated')) as r(role)
union all
select '4. exécution ' || r.role,
       'private.create_booking_at (interne, aucun droit attendu)',
       case when coalesce(has_function_privilege(r.role,
              to_regprocedure('private.create_booking_at(timestamptz,uuid,timestamptz,uuid,text,text,text,text,text,uuid)'),
              'execute'), false)
            then 'ERREUR : droit inattendu' else 'OK : refusé' end
  from (values ('anon'), ('authenticated')) as r(role)
order by 1, 2;
