-- ============================================================================
-- MÁSCARA DE DEANONIMIZACIÓN — happy_posts — 2026-07-18
--
-- happy_posts guarda user_id incluso en posts anónimos (anon=true) -> se filtraba
-- al anon. PERO happy_posts tiene REALTIME (_happyRtCh), y el websocket necesita
-- SELECT para entregar eventos. Por eso, a diferencia de las tablas de comentarios,
-- acá:
--   * Vista happy_posts_full (security_definer) enmascara user_id cuando anon
--     (salvo fila propia) -> el DISPLAY va por la vista (v1575 con fallback).
--   * Se revoca SELECT del crudo SOLO al rol `anon` (cierra el scraping anónimo).
--     `authenticated` CONSERVA SELECT para que el realtime siga funcionando.
--   * El handler de realtime re-fetchea por la vista, así que igual ve enmascarado.
--
-- user_id es TEXT (se compara con strings en el cliente). Si diera error de tipos
-- (uuid = text), quitar el ::text.
-- ============================================================================

create or replace view public.happy_posts_full as
  select
    id, user_name, user_av, emoji, text, photo, anon, reactions, comments, created_at,
    case when (not anon) or user_id = (auth.uid())::text then user_id else null end as user_id
  from public.happy_posts;

grant select on public.happy_posts_full to anon, authenticated;

-- Solo anon: authenticated conserva SELECT (lo necesita el realtime).
revoke select on public.happy_posts from anon;
