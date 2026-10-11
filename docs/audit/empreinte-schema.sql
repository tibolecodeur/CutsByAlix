-- Empreinte du schéma (audit, consigne 23, docs/AUDIT-2026-10.md §4).
--
-- UNE SEULE requête SELECT : elle ne modifie rien (aucune écriture, aucun verrou durable).
-- Résultat : UNE ligne, UNE colonne « empreinte » (texte multi-lignes) à copier telle quelle.
-- Ne contient que la STRUCTURE (noms, types, droits, md5 des définitions) : aucune ligne de
-- table, donc ni donnée personnelle, ni adresse, ni jeton, ni clé.
--
-- Production : Supabase → SQL Editor → coller ce fichier → Run → copier la cellule.
-- Local      : docker exec -i supabase_db_site-barber psql -U postgres -At < docs/audit/empreinte-schema.sql
--
-- La 1re ligne est un md5 de tout le reste : si elle est identique des deux côtés, les schémas
-- sont identiques sur tout ce qui est listé. Sinon, comparer ligne à ligne (diff).
with
-- Rôles dont on compare les droits (PUBLIC = grantee 0).
roles(oid, name) as (
  select 0::oid, 'PUBLIC'
  union all
  select oid, rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
),
-- Tables, vues et vues matérialisées de public et private.
rels as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm')
),
-- Fonctions de public et private, hors fonctions d'extensions (pgtap, dblink, btree_gist…).
funcs as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         p.prosecdef, p.proconfig, p.proacl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
lines(line) as (
  -- 1. Tables : type d'objet et RLS (activée / forcée).
  select format('table      | %s.%s | kind=%s rls=%s force=%s', nspname, relname, relkind,
                relrowsecurity, relforcerowsecurity)
    from rels
  union all
  -- 2. Colonnes : type, NOT NULL, valeur par défaut.
  select format('colonne    | %s.%s.%s | %s notnull=%s default=%s', r.nspname, r.relname, a.attname,
                format_type(a.atttypid, a.atttypmod), a.attnotnull,
                coalesce(pg_get_expr(d.adbin, d.adrelid), '-'))
    from rels r
    join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  -- 3. Contraintes (dont l'exclusion anti-double-réservation) : md5 de la définition.
  select format('contrainte | %s.%s | %s %s', r.nspname, r.relname, co.conname,
                md5(pg_get_constraintdef(co.oid)))
    from pg_constraint co join rels r on r.oid = co.conrelid
  union all
  -- 4. Triggers.
  select format('trigger    | %s.%s | %s %s', r.nspname, r.relname, t.tgname, md5(pg_get_triggerdef(t.oid)))
    from pg_trigger t join rels r on r.oid = t.tgrelid
   where not t.tgisinternal
  union all
  -- 5. Politiques RLS (public, private et storage) : commande, rôles, md5 des conditions.
  select format('policy     | %s.%s | %s %s roles=%s using=%s check=%s', p.schemaname, p.tablename,
                p.policyname, p.cmd, p.roles::text, md5(coalesce(p.qual, '')),
                md5(coalesce(p.with_check, '')))
    from pg_policies p
   where p.schemaname in ('public', 'private', 'storage')
  union all
  -- 6. Droits sur les tables (anon, authenticated, service_role, PUBLIC).
  select format('droit-tab  | %s.%s | %s %s', r.nspname, r.relname, ro.name,
                string_agg(x.privilege_type, ',' order by x.privilege_type))
    from rels r cross join lateral aclexplode(r.relacl) x join roles ro on ro.oid = x.grantee
   group by r.nspname, r.relname, ro.name
  union all
  -- 7. Droits par colonne.
  select format('droit-col  | %s.%s.%s | %s %s', r.nspname, r.relname, a.attname, ro.name,
                string_agg(x.privilege_type, ',' order by x.privilege_type))
    from rels r
    join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) x join roles ro on ro.oid = x.grantee
   group by r.nspname, r.relname, a.attname, ro.name
  union all
  -- 8. Fonctions : security definer, réglages (search_path), md5 de la définition complète.
  select format('fonction   | %s | definer=%s config=%s def=%s', sig, prosecdef,
                coalesce(array_to_string(proconfig, ';'), '-'), md5(pg_get_functiondef(oid)))
    from funcs
  union all
  -- 9. Droit EXECUTE sur les fonctions. Sans ACL explicite, PostgreSQL donne EXECUTE à PUBLIC.
  select format('droit-fn   | %s | %s', f.sig,
                coalesce((select string_agg(ro.name, ',' order by ro.name)
                            from aclexplode(f.proacl) x join roles ro on ro.oid = x.grantee
                           where x.privilege_type = 'EXECUTE'), 'aucun (ou PUBLIC par défaut si acl vide)')
                || case when f.proacl is null then ' [acl vide]' else '' end)
    from funcs f
  union all
  -- 10. Accès aux schémas.
  select format('schema     | %s | %s usage=%s', n.nspname, ro.name, has_schema_privilege(ro.name, n.oid, 'USAGE'))
    from pg_namespace n cross join (select name from roles where name <> 'PUBLIC') ro
   where n.nspname in ('public', 'private')
  union all
  -- 11. Bucket de la galerie (configuration seulement, aucun fichier).
  select format('bucket     | %s | public=%s taille_max=%s types=%s', id, public, file_size_limit,
                allowed_mime_types::text)
    from storage.buckets
  union all
  -- 12. Extensions installées (versions).
  select format('extension  | %s | %s', extname, extversion) from pg_extension
  union all
  -- 13. Migrations appliquées (numéros de version seulement).
  select format('migration  | %s', version) from supabase_migrations.schema_migrations
),
sorted as (
  select string_agg(line, E'\n' order by line collate "C") as body from lines
)
select 'md5 total  | ' || md5(body) || E'\n' || body as empreinte
  from sorted;
