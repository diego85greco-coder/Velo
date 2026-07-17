-- CRÍTICO (seguridad): profiles tenía una política `allow_all` PERMISSIVE de
-- comando ALL con USING(true)/WITH CHECK(true) para {public}. Como las políticas
-- permisivas se combinan con OR, esa política dejaba que CUALQUIER usuario (o
-- anónimo) no solo leyera, sino que hiciera UPDATE/DELETE sobre el perfil de
-- OTRO (nombre, avatar, motto, bio, email, push_subscription...). El `role` lo
-- salvaba el trigger velo_protect_role, pero el resto quedaba a merced de todos.
--
-- Solución: dropear `allow_all`. Las escrituras legítimas siguen cubiertas por
-- profiles_insert_own (WITH CHECK id = auth.uid) y profiles_update_own
-- (USING/WITH CHECK id = auth.uid). El borrado de perfiles es SIEMPRE una acción
-- de admin (paneles), así que se preserva con una política gated por admin.
-- La lectura pública (profiles_select, true) queda intacta: ningún read se rompe.

drop policy if exists "allow_all" on public.profiles;

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated
  using ( public.velo_is_admin() );
