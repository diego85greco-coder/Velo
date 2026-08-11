-- ============================================================================
-- FUNCIONES `SECURITY DEFINER` LLAMABLES SIN CUENTA  (detectado 11/08/2026)
--
-- El linter de Supabase las marca como ERROR/WARN. Revisadas una por una:
--
--  * `increment_momento_hearts(post_id)` — REAL. No comprueba nada: hace
--    `update momentos set hearts = hearts+1`. Sin cuenta, en bucle, se inflan
--    los corazones de cualquier momento. Pasa a exigir sesión.
--
--  * `get_user_session_counts(p_user_id)` — fuga menor: devuelve cuántas veces
--    ayudó y fue ayudada cualquier persona, sin registrarse.
--
--  * `velo_cleanup_ia_usage()` / `velo_cleanup_api_usage()` — sólo borran
--    filas de más de 48 h, así que no reinician el cupo del día; pero son
--    tareas de mantenimiento y no tienen por qué estar en la API pública.
--
--  * `_bt_check_rate_limit`, `_mo_check_rate_limit`, `_bottle_check_rate_limit`,
--    `_bottle_react_rate_limit`, `dm_push_notify_fn`, `velo_protect_role` — son
--    funciones de trigger. Los triggers se disparan igual sin el permiso de
--    EXECUTE; que estén expuestas en `/rest/v1/rpc/` no aporta nada.
--
--  * `leave_vibe_group(gid)` — ya se protege sola (filtra por `auth.uid()`, que
--    como anónimo es NULL). Se le quita el permiso igual, por prolijidad.
--
-- NO se tocan `velo_is_admin()` ni `velo_is_premium(uid)`: se invocan dentro de
-- políticas RLS y las evalúa el rol que consulta, así que quitarles EXECUTE
-- haría fallar consultas legítimas. Es el mismo error de «cerrar sin auditar»
-- que ya rompió esto dos veces.
-- ============================================================================

revoke execute on function public.increment_momento_hearts(text) from anon, public;
revoke execute on function public.get_user_session_counts(text)  from anon, public;
revoke execute on function public.leave_vibe_group(uuid)         from anon, public;

revoke execute on function public.velo_cleanup_ia_usage()  from anon, authenticated, public;
revoke execute on function public.velo_cleanup_api_usage() from anon, authenticated, public;

revoke execute on function public._bt_check_rate_limit()        from anon, authenticated, public;
revoke execute on function public._mo_check_rate_limit()        from anon, authenticated, public;
revoke execute on function public._bottle_check_rate_limit()    from anon, authenticated, public;
revoke execute on function public._bottle_react_rate_limit()    from anon, authenticated, public;
revoke execute on function public.dm_push_notify_fn()           from anon, authenticated, public;
revoke execute on function public.velo_protect_role()           from anon, authenticated, public;
