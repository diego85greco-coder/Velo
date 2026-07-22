-- ============================================================================
-- MÁSCARA DE DEANONIMIZACIÓN — bitacora_posts — 2026-07-18
--
-- bitacora_posts_full enmascaraba author_* en anónimos pero conservaba user_id
-- (bp.*). Se redefine ocultando user_id salvo post no-anon o fila propia. El feed
-- ya lee bitacora_posts_full en todos lados; los reads crudos con user_id son de
-- posts PROPIOS (.eq('user_id',uid)) -> no filtran.
--
-- bitacora_posts tiene REALTIME -> se revoca SELECT del crudo SOLO al rol anon
-- (authenticated conserva para el websocket y los conteos propios).
--
-- OJO: en bitacora_posts user_id es UUID (el join es p.id = bp.user_id, sin cast),
-- a diferencia de bitacora_comments que era TEXT.
-- ============================================================================

drop view if exists public.bitacora_posts_full;
create view public.bitacora_posts_full as
  select
    bp.id, bp.categoria, bp.titulo, bp.contenido, bp.is_anon,
    bp.votos_a, bp.votos_b, bp.created_at, bp.postura_a, bp.postura_b, bp.tema,
    case when (not bp.is_anon) or bp.user_id = (auth.uid())::text
         then bp.user_id else null end as user_id,
    case when bp.is_anon then null else p.username end as author_username,
    case when bp.is_anon then null else p.nombre   end as author_name,
    case when bp.is_anon then null else p.avatar    end as author_avatar
  from public.bitacora_posts bp
  left join public.profiles p on p.id::text = bp.user_id;

grant select on public.bitacora_posts_full to anon, authenticated;
revoke select on public.bitacora_posts from anon;
