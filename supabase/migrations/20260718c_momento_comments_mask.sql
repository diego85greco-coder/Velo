-- ============================================================================
-- MÁSCARA DE DEANONIMIZACIÓN — momento_comments (piloto) — 2026-07-18
--
-- momento_comments exponía user_id al rol anon INCLUSO en comentarios anónimos
-- (los que no adjuntaron perfil / user_name). Eso permite ligar comentarios
-- anónimos a una cuenta.
--
-- Fix: una vista SECURITY DEFINER que oculta user_id cuando el comentario es
-- anónimo (sin user_name), + revocar SELECT sobre la tabla cruda. La app (v1565)
-- lee la vista (con fallback al crudo mientras esto no corra). Los INSERT siguen
-- yendo a la tabla cruda (no se tocan).
--
-- NOTA: la vista es security_definer (default, NO security_invoker) a propósito:
-- así sigue funcionando aunque revoquemos el SELECT del crudo al invocador.
-- ============================================================================

create or replace view public.momento_comments_feed as
  select
    id, momento_id, text, user_name, user_avatar,
    case when coalesce(user_name, '') <> '' then user_id else null end as user_id,
    created_at
  from public.momento_comments;

grant select on public.momento_comments_feed to anon, authenticated;

-- Cerrar la lectura directa del crudo (los INSERT no la necesitan: no usan .select()).
revoke select on public.momento_comments from anon, authenticated;

-- Verificación (debería dar 0 filas / error al leer el crudo con la anon key, y
-- filas con user_id NULL en los anónimos al leer la vista):
--   select user_name, user_id from public.momento_comments_feed limit 5;
