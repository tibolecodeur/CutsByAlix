-- =============================================================================
-- Espace admin : galerie et envoi de photos (consigne 20). Voir docs/adr/0006.
--   1. private.settings() : nouvelle règle gallery_max_items (60 photos, protège le quota
--      gratuit de Storage). Type de retour changé : drop puis create.
--   2. gallery_items : caption remplacée par alt_text (obligatoire), width / height (évitent
--      les sauts de mise en page), consent_at (accord de la personne photographiée), chemin
--      au format « <uuid v4>.webp|jpg » uniquement, unique.
--   3. Droits : anon ne lit que les colonnes d'affichage des photos publiées ; authenticated
--      n'a plus aucun droit direct, tout passe par les fonctions admin.
--   4. Bucket « gallery » PRIVÉ : une photo masquée n'est plus lisible par son URL. Le public
--      obtient une URL signée (durée limitée) seulement pour une photo publiée.
--      Types : webp et jpeg (Safari iOS n'encode pas le WebP, le navigateur se replie sur le
--      JPEG). 2 Mo max (le navigateur envoie une image ré-encodée de 1200 px au plus).
--   5. Policies Storage : dépôt admin limité au format de nom et au nombre de fichiers, plus
--      de remplacement (update), lecture anon des seuls objets publiés.
--   6. Fonctions admin : liste, ajout, publication, texte alternatif, ordre, suppression,
--      fichiers orphelins.
-- Les fonctions publiques : security definer, réservées à un utilisateur listé dans admins
-- (sinon 42501 « forbidden »), exécutables par authenticated seulement, « volatile » (jamais
-- appelables en GET par PostgREST).
-- Erreurs P0001 : invalid_input · invalid_path · file_missing · already_exists ·
-- gallery_limit_reached · consent_required · not_found.
--
-- Fichier et ligne : Storage interdit « delete from storage.objects » en SQL (trigger
-- storage.protect_delete) ; seul le front, par l'API Storage, efface un fichier. Ordre imposé :
-- envoi du fichier PUIS ligne (admin_add_gallery_item vérifie que le fichier existe) ; ligne
-- supprimée PUIS fichier. Au pire il reste un fichier sans ligne, invisible du public, que
-- admin_gallery_orphans() permet de ramasser. Jamais une ligne sans fichier.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Règles métier : mêmes valeurs qu'avant + gallery_max_items. Aucune fonction n'en dépend
--    au sens de pg_depend (corps plpgsql / sql non « atomic ») : elles la relisent par son nom.
-- -----------------------------------------------------------------------------
drop function private.settings();
create function private.settings()
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
    interval '48 hours',
    interval '28 days',
    interval '24 hours',
    2,
    interval '6 months',
    60;
$$;
revoke all on function private.settings() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Table. Aucune photo n'a encore été envoyée (la galerie admin était une maquette) : la
--    table est vide en production. Si ce n'était pas le cas, « add column … not null » sans
--    valeur par défaut ferait échouer TOUTE la migration : rien ne serait perdu en silence.
-- -----------------------------------------------------------------------------
alter table public.gallery_items drop column caption;

alter table public.gallery_items
  -- Décrit la coupe pour un lecteur d'écran. Pas d'espace en bord, ni caractère de contrôle,
  -- invisible ou de balisage (private.is_safe_text, comme les noms des clients).
  add column alt_text text not null
    constraint gallery_items_alt_text_check
    check (char_length(alt_text) between 1 and 200
           and alt_text = btrim(alt_text)
           and private.is_safe_text(alt_text)),
  -- Dimensions de l'image envoyée (1200 px max sur le grand côté).
  add column width integer not null
    constraint gallery_items_width_check check (width between 1 and 1200),
  add column height integer not null
    constraint gallery_items_height_check check (height between 1 and 1200),
  -- Date à laquelle Alix a confirmé l'accord de la personne photographiée, à la dernière
  -- publication. Une photo publiée a forcément un accord.
  add column consent_at timestamptz;

alter table public.gallery_items
  add constraint gallery_items_published_needs_consent
  check (not published or consent_at is not null);

-- Chemin : un uuid v4 en minuscules + extension, à la racine du bucket. Ni dossier, ni « .. »,
-- ni nom d'origine du fichier (il peut contenir un prénom, une date, un lieu).
alter table public.gallery_items drop constraint gallery_items_image_path_check;
alter table public.gallery_items
  add constraint gallery_items_image_path_check
  check (image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$'),
  add constraint gallery_items_image_path_key unique (image_path);

-- Même format, réutilisé par les policies Storage et les fonctions.
create function private.is_gallery_path(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|jpg)$',
    false);
$$;
revoke all on function private.is_gallery_path(text) from public, anon, authenticated;
grant execute on function private.is_gallery_path(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Droits. anon : lecture par COLONNE (ni published, ni consent_at, ni created_at) ; la
--    policy gallery_items_public_read (using (published)) filtre toujours les lignes.
--    authenticated : plus rien. La policy gallery_items_admin_all reste comme filet.
-- -----------------------------------------------------------------------------
revoke all on table public.gallery_items from anon, authenticated;
grant select (id, image_path, alt_text, width, height, sort_order)
  on table public.gallery_items to anon;

-- -----------------------------------------------------------------------------
-- 4. Bucket privé, webp / jpeg, 2 Mo.
-- -----------------------------------------------------------------------------
update storage.buckets
   set public = false,
       file_size_limit = 2097152,
       allowed_mime_types = array['image/webp', 'image/jpeg']
 where id = 'gallery';

-- -----------------------------------------------------------------------------
-- 5. Policies Storage (bucket « gallery »).
-- -----------------------------------------------------------------------------

-- Reste-t-il de la place dans le bucket ? Lu avec les droits du propriétaire : la policy
-- d'insertion ne doit dépendre ni de ce que l'appelant voit, ni d'un droit sur settings().
-- Marge de 5 fichiers au-delà de la limite de photos : un envoi interrompu laisse un fichier
-- en attente de nettoyage, il ne doit pas bloquer Alix.
create function private.gallery_bucket_has_room()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from storage.objects where bucket_id = 'gallery')
         < (select cfg.gallery_max_items + 5 from private.settings() cfg);
$$;
revoke all on function private.gallery_bucket_has_room() from public, anon, authenticated;
grant execute on function private.gallery_bucket_has_room() to authenticated;

-- Dépôt : admin, nom au format uuid, et plafond de fichiers. Protège le quota même si on
-- appelle l'API Storage sans passer par le site.
drop policy if exists gallery_admin_insert on storage.objects;
create policy gallery_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery'
    and (select private.is_admin())
    and private.is_gallery_path(name)
    and (select private.gallery_bucket_has_room())
  );

-- Plus de remplacement d'un fichier existant : une photo envoyée ne change jamais de
-- contenu (une nouvelle photo = un nouveau nom).
drop policy if exists gallery_admin_update on storage.objects;

-- Lecture publique : uniquement les objets dont la ligne est visible d'anon, c'est-à-dire
-- publiée (la RLS de gallery_items s'applique dans la sous-requête). Sert à créer une URL
-- signée ; un fichier masqué ou orphelin reste inaccessible.
drop policy if exists gallery_public_select_published on storage.objects;
create policy gallery_public_select_published on storage.objects
  for select to anon
  using (
    bucket_id = 'gallery'
    and exists (select 1 from public.gallery_items g where g.image_path = name)
  );

-- gallery_admin_select et gallery_admin_delete (admin) restent inchangées.

-- -----------------------------------------------------------------------------
-- 6. Fonctions admin.
-- -----------------------------------------------------------------------------

-- Interne : valide et nettoie un texte alternatif (mêmes règles que la contrainte).
create function private.clean_alt_text(p_alt_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_alt text := btrim(p_alt_text);
begin
  if v_alt is null or char_length(v_alt) not between 1 and 200
     or not private.is_safe_text(v_alt) then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  return v_alt;
end;
$$;
revoke all on function private.clean_alt_text(text) from public, anon, authenticated;

-- Interne : renumérote 1, 2, 3… dans l'ordre actuel (élimine les ex aequo).
create function private.renumber_gallery()
returns void
language sql
volatile
set search_path = ''
as $$
  update public.gallery_items g
     set sort_order = r.n
    from (select id, row_number() over (order by sort_order, created_at, id)::integer as n
            from public.gallery_items) r
   where g.id = r.id and g.sort_order <> r.n;
$$;
revoke all on function private.renumber_gallery() from public, anon, authenticated;

-- Liste complète pour l'admin (publiées et masquées), dans l'ordre d'affichage.
create function public.admin_list_gallery_items()
returns table (
  id uuid,
  image_path text,
  alt_text text,
  width integer,
  height integer,
  sort_order integer,
  published boolean,
  consent_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile  -- pas « stable » : jamais en GET
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select g.id, g.image_path, g.alt_text, g.width, g.height, g.sort_order, g.published,
           g.consent_at, g.created_at
      from public.gallery_items g
     order by g.sort_order, g.created_at, g.id;
end;
$$;
revoke all on function public.admin_list_gallery_items() from public, anon, authenticated;
grant execute on function public.admin_list_gallery_items() to authenticated;

-- Ajout, après l'envoi du fichier. Le fichier doit exister dans le bucket avec le type
-- annoncé par son extension (le type est vérifié par Storage contre allowed_mime_types).
-- Publiée tout de suite seulement si Alix a confirmé l'accord ; sinon masquée.
create function public.admin_add_gallery_item(
  p_image_path text,
  p_alt_text text,
  p_width integer,
  p_height integer,
  p_consent boolean
)
returns table (
  id uuid,
  image_path text,
  alt_text text,
  width integer,
  height integer,
  sort_order integer,
  published boolean,
  consent_at timestamptz,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alt text;
  v_mime text;
  v_max integer;
  v_publish boolean := coalesce(p_consent, false);
begin
  perform private.require_admin();

  if not private.is_gallery_path(p_image_path) then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;
  v_alt := private.clean_alt_text(p_alt_text);
  if p_width is null or p_height is null
     or p_width not between 1 and 1200 or p_height not between 1 and 1200 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  -- Un ajout à la fois : deux envois simultanés ne dépassent pas la limite.
  perform pg_advisory_xact_lock(hashtextextended('gallery:items', 0));

  select o.metadata ->> 'mimetype' into v_mime
    from storage.objects o
   where o.bucket_id = 'gallery' and o.name = p_image_path;
  if not found
     or v_mime is distinct from (case when p_image_path like '%.webp' then 'image/webp'
                                      else 'image/jpeg' end) then
    raise exception 'file_missing' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.gallery_items g where g.image_path = p_image_path) then
    raise exception 'already_exists' using errcode = 'P0001';
  end if;

  select cfg.gallery_max_items into v_max from private.settings() cfg;
  if (select count(*) from public.gallery_items) >= v_max then
    raise exception 'gallery_limit_reached' using errcode = 'P0001';
  end if;

  return query
    insert into public.gallery_items as g
      (image_path, alt_text, width, height, sort_order, published, consent_at)
    values (
      p_image_path, v_alt, p_width, p_height,
      (select coalesce(max(x.sort_order), 0) + 1 from public.gallery_items x),
      v_publish,
      case when v_publish then now() end
    )
    returning g.id, g.image_path, g.alt_text, g.width, g.height, g.sort_order, g.published,
              g.consent_at, g.created_at;
end;
$$;
revoke all on function public.admin_add_gallery_item(text, text, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_add_gallery_item(text, text, integer, integer, boolean)
  to authenticated;

-- Publier / masquer. Publier exige de confirmer l'accord À CHAQUE FOIS (p_consent = true) :
-- une personne a pu changer d'avis depuis qu'Alix a masqué la photo.
create function public.admin_set_gallery_item_published(
  p_id uuid,
  p_published boolean,
  p_consent boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_id is null or p_published is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_published and not coalesce(p_consent, false) then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;

  update public.gallery_items g
     set published = p_published,
         consent_at = case when p_published then now() else g.consent_at end
   where g.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.admin_set_gallery_item_published(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_gallery_item_published(uuid, boolean, boolean)
  to authenticated;

-- Modifier le texte alternatif.
create function public.admin_update_gallery_item_alt(p_id uuid, p_alt_text text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alt text;
begin
  perform private.require_admin();
  if p_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  v_alt := private.clean_alt_text(p_alt_text);

  update public.gallery_items g set alt_text = v_alt where g.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.admin_update_gallery_item_alt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_gallery_item_alt(uuid, text) to authenticated;

-- Monter / descendre d'une place. false si la photo est déjà en tête (ou en queue).
create function public.admin_move_gallery_item(p_id uuid, p_direction text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order integer;
  v_neighbor_id uuid;
  v_neighbor_order integer;
begin
  perform private.require_admin();
  if p_id is null or p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gallery:items', 0));
  perform private.renumber_gallery();

  select g.sort_order into v_order from public.gallery_items g where g.id = p_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select g.id, g.sort_order into v_neighbor_id, v_neighbor_order
    from public.gallery_items g
   where (p_direction = 'up' and g.sort_order = v_order - 1)
      or (p_direction = 'down' and g.sort_order = v_order + 1);
  if not found then
    return false;
  end if;

  update public.gallery_items g
     set sort_order = case when g.id = p_id then v_neighbor_order else v_order end
   where g.id in (p_id, v_neighbor_id);
  return true;
end;
$$;
revoke all on function public.admin_move_gallery_item(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_move_gallery_item(uuid, text) to authenticated;

-- Suppression de la ligne. Renvoie le chemin du fichier, que le front efface ensuite par
-- l'API Storage (la base ne le peut pas).
create function public.admin_delete_gallery_item(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_admin();
  if p_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('gallery:items', 0));
  delete from public.gallery_items g where g.id = p_id returning g.image_path into v_path;
  if v_path is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.renumber_gallery();
  return v_path;
end;
$$;
revoke all on function public.admin_delete_gallery_item(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_gallery_item(uuid) to authenticated;

-- Fichiers sans ligne (envoi interrompu, suppression du fichier ratée), à effacer par le front.
-- Seulement ceux de plus d'1 h : un envoi en cours n'a pas encore sa ligne.
create function private.admin_gallery_orphans_at(p_now timestamptz)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'gallery'
     and o.created_at < p_now - interval '1 hour'
     and not exists (select 1 from public.gallery_items g where g.image_path = o.name)
   order by o.created_at
   limit 100;
$$;
revoke all on function private.admin_gallery_orphans_at(timestamptz)
  from public, anon, authenticated;

create function public.admin_gallery_orphans()
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query select * from private.admin_gallery_orphans_at(now());
end;
$$;
revoke all on function public.admin_gallery_orphans() from public, anon, authenticated;
grant execute on function public.admin_gallery_orphans() to authenticated;
