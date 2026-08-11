-- ============================================================================
-- EL DIRECTORIO DE USUARIOS SE DESCARGABA SIN CUENTA  (detectado 11/08/2026)
--
-- `profiles_select` estaba declarada `to {anon, authenticated} using (true)` y
-- `anon` conservaba el grant de SELECT sobre casi todas las columnas. Con la
-- clave pública del repositorio, sin registrarse:
--
--   GET /rest/v1/profiles?select=id,nombre,username,motto,role,user_status
--   → 200 OK, los 11 perfiles
--
-- Devolvía nombre, usuario, lema, avatar, estado, a quién bloqueó cada persona,
-- su buddy — y el `role`, o sea qué cuenta es la de administración.
--
-- `email` y `push_subscription` NO estaban expuestos: la migración
-- 20260717000721 ya les había quitado el permiso por columna. Eso siguió bien.
--
-- POR QUÉ ESTABA ABIERTO: la política tiene que ser `using (true)` para
-- `authenticated`, porque la app muestra el nombre y el avatar de otras
-- personas en toda la comunidad. Lo que sobraba era `anon` en la lista de roles.
--
-- AUDITORÍA PREVIA: en premium.js, todas las lecturas de `profiles` filtran por
-- un id que sale de la sesión (`_getOrCreateProfile`, `_sbSyncProfile`, buddy,
-- etc.). No hay ninguna lectura de perfiles antes de tener sesión. Además
-- `_getOrCreateProfile` ya envuelve su consulta en try/catch, así que un fallo
-- no rompe el alta.
--
-- REVERSIÓN, si algún nombre apareciera vacío:
--   grant select on public.profiles to anon;
--   alter policy profiles_select on public.profiles to anon, authenticated;
-- ============================================================================

alter policy profiles_select on public.profiles to authenticated;

revoke select on public.profiles from anon;

-- `anon` tampoco necesita escribir: sus políticas ya eran sólo de
-- `authenticated`, así que el grant no hacía más que dejar la puerta apoyada.
revoke insert, update, delete on public.profiles from anon;

-- ── VERIFICACIÓN ───────────────────────────────────────────────────────────
--   curl -s "$SUPA/rest/v1/profiles?select=id,nombre" -H "apikey: $ANON"
--   → 401, permission denied for table profiles
-- Con sesión, la app tiene que seguir viendo el nombre de las demás personas.
