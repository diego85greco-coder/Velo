-- Dos puertas chicas que quedaron abiertas a quien no ha iniciado sesión.
-- Las encontró el linter de Supabase (get_advisors), no la lectura del código.
--
-- 1) velo_is_premium(uid)
--    Es SECURITY DEFINER y `anon` podía ejecutarla. Con eso, cualquiera con la
--    clave pública —que va en el HTML, o sea: cualquiera— podía preguntar
--    «¿este usuario tiene Plus?» pasando un id y obtener sí/no, sin registrarse.
--    Es un oráculo: poco daño por respuesta, pero responde siempre y sin límite.
--
--    Se comprobó antes de revocar que NINGUNA policy de rol `public`/`anon` la
--    invoca. Las cuatro que la usan —help_posts_daily_limit, ia_usage_daily_limit,
--    guardian_requests_daily_limit, vibe_groups_private_needs_plus— son todas de
--    rol `authenticated`. Después de revocar se volvió a probar el tope diario
--    de la Sala de Ayuda haciéndose pasar por un usuario real: la policy sigue
--    dejando pasar la inserción.
--
--    OJO CON EL REVOKE: quitárselo a `anon` a secas NO surte efecto. Las
--    funciones nacen en Postgres con EXECUTE concedido a PUBLIC, y `anon` lo
--    heredaba por ahí; `has_function_privilege('anon', ...)` seguía diciendo
--    true después del primer revoke. Hay que quitar el grant de PUBLIC y
--    devolvérselo explícitamente a quien sí lo necesita.
--
--    velo_is_admin() se deja como está a propósito, aunque el linter también la
--    marque: sólo lee el email del JWT, no toca ninguna tabla, y para anon
--    devuelve false sin revelar nada. Además la invocan varias policies de rol
--    `public`, así que revocarla convertiría lecturas que hoy devuelven cero
--    filas en errores 42501.
--
-- 2) bitacora_reported_ids
--    La vista existe (v1620) para que el feed pueda ocultar posts reportados sin
--    dejar ver quién reportó a quién. Pero quedó legible por `anon`, y con
--    security_invoker=off. Sin registrarse se podía listar qué posts de la
--    Bitácora habían sido denunciados. La app sólo la consulta desde _btInit,
--    con sesión abierta, así que cerrarla a anon no cambia nada para el usuario.
--
-- Comprobado contra el endpoint público real, con la clave que va en el HTML:
--   POST /rest/v1/rpc/velo_is_premium  → 401  42501 permission denied
--   GET  /rest/v1/bitacora_reported_ids → 401  42501 permission denied
--
-- (De paso se verificó profiles_full, que el linter marca como ERROR: lleva
--  `where id = auth.uid()` dentro de la propia vista, así que para anon devuelve
--  200 con lista vacía. Falsa alarma; se deja.)

revoke execute on function public.velo_is_premium(text) from public;
revoke execute on function public.velo_is_premium(text) from anon;
grant  execute on function public.velo_is_premium(text) to authenticated;
grant  execute on function public.velo_is_premium(text) to service_role;

revoke select on public.bitacora_reported_ids from anon;
