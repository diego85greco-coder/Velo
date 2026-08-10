-- ============================================================================
-- LOS CÍRCULOS NO FUNCIONABAN: policies que consultan auth.users (07/08) — APLICADA
--
-- CINCO policies resolvían el email de la persona así:
--     (select users.email from auth.users where users.id = auth.uid())
--
-- El objetivo era razonable: aceptar filas antiguas indexadas por email además
-- de por uuid. El problema es que el rol `authenticated` **no tiene permiso de
-- lectura sobre auth.users**, y una policy se evalúa con los permisos de quien
-- consulta. La consulta entera aborta antes de devolver nada:
--     ERROR 42501: permission denied for table users
--
-- IMPACTO REAL, comprobado contra producción:
--   * circle_messages (SELECT) → **leer los mensajes de un Círculo fallaba para
--     todo el mundo**. El chat grupal no funcionaba. En absoluto.
--   * circle_messages (INSERT) → tampoco se podía escribir en un Círculo.
--   * circle_members  (ALL)    → entrar o salir de un Círculo fallaba.
--   * user_favorites  (INSERT/DELETE) → añadir o quitar un favorito fallaba.
--
-- Nada de esto se veía: son llamadas dentro de try/catch mudos. Se encontró
-- probando sección por sección, no por un aviso del analizador.
--
-- ARREGLO: el email ya viene en el token de la sesión. `auth.jwt() ->> 'email'`
-- devuelve lo mismo sin tocar auth.users y sin necesitar permisos extra. La
-- condición queda equivalente para filas por uuid y para filas por email.
-- ============================================================================

drop policy if exists cmem_write_own on public.circle_members;
create policy cmem_write_own on public.circle_members
  for all to authenticated
  using      ( user_id = (select auth.uid())::text or user_id = (select auth.jwt() ->> 'email') )
  with check ( user_id = (select auth.uid())::text or user_id = (select auth.jwt() ->> 'email') );

drop policy if exists cm_select_member on public.circle_messages;
create policy cm_select_member on public.circle_messages
  for select to authenticated
  using (
    circle_id in (
      select cm.circle_id from public.circle_members cm
       where cm.user_id = (select auth.uid())::text
          or cm.user_id = (select auth.jwt() ->> 'email')
    )
  );

drop policy if exists cm_insert_member on public.circle_messages;
create policy cm_insert_member on public.circle_messages
  for insert to authenticated
  with check ( user_id = (select auth.uid())::text or user_id = (select auth.jwt() ->> 'email') );

drop policy if exists favs_insert_own on public.user_favorites;
create policy favs_insert_own on public.user_favorites
  for insert to authenticated
  with check ( user_id = (select auth.uid())::text or user_id = (select auth.jwt() ->> 'email') );

drop policy if exists favs_delete_own on public.user_favorites;
create policy favs_delete_own on public.user_favorites
  for delete to authenticated
  using ( user_id = (select auth.uid())::text or user_id = (select auth.jwt() ->> 'email') );
