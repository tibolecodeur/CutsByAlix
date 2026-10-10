-- =============================================================================
-- Espace admin (consigne 17) : être connecté ne donne AUCUN droit, seule une ligne dans
-- public.admins en donne.
-- Jusqu'ici, les deux lectures publiques visaient « anon, authenticated » : un compte connecté
-- mais pas admin (qui ne devrait pas exister : inscriptions fermées) lisait le catalogue, et
-- TOUTES les colonnes de services (anon, lui, n'en lit que 5). Le site public n'utilise que
-- anon ; l'admin garde tout via services_admin_all / gallery_items_admin_all.
-- alter policy ne touche qu'aux rôles visés : la condition (using) ne change pas.
-- =============================================================================

alter policy services_public_read on public.services to anon;
alter policy gallery_items_public_read on public.gallery_items to anon;
