-- ============================================================================
-- help_posts: cerrar scraping anónimo del crudo — 2026-07-18
--
-- El DISPLAY ya lee la vista help_posts_feed (que enmascara user_id en anónimos,
-- migración 20260717b). Pero el crudo help_posts seguía siendo anon-readable
-- (help_all ALL true), así que un scraper con la anon key podía leer user_id
-- salteándose la vista.
--
-- help_posts tiene REALTIME (_helpRtCh), así que authenticated CONSERVA SELECT
-- (lo necesita el websocket). Se revoca SOLO al rol anon. Los counts del cliente
-- corren como authenticated y siguen funcionando. No hace falta cambio de código.
-- ============================================================================

revoke select on public.help_posts from anon;
