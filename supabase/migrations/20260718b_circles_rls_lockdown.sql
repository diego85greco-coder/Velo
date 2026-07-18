-- ============================================================================
-- CÍRCULOS DE PAZ: cerrar lectura anónima de chats y membresías — 2026-07-18
--
-- Sondeo con la anon key mostró que CUALQUIERA (sin loguearse) podía leer:
--   * circle_messages: los CHATS de los grupos de apoyo (texto + autor)
--   * circle_members:  QUIÉN está en cada círculo (asociación con un tema de
--                      salud mental — ansiedad, duelo, etc.)
--
-- circle_messages ya tenía la política member-only correcta (cm_select_member),
-- pero una política `true` la anulaba. La quitamos. El código (v1563) ahora espera
-- a que la membresía commitee antes de leer, así la 1ª lectura no vuelve vacía.
-- ============================================================================

-- 1) circle_messages: quitar la SELECT pública; queda solo cm_select_member
--    (authenticated + miembro del círculo).
drop policy if exists "circle_msg_select" on public.circle_messages;

-- 2) circle_members: allow_all (ALL, {public}, true) exponía todas las membresías
--    al anon. Lo reemplazamos por: lectura solo autenticados (la presencia lee
--    filas de otros, así que no se puede restringir a "solo mías"); escritura
--    solo sobre la propia fila.
drop policy if exists "allow_all" on public.circle_members;

create policy "cmem_select_auth" on public.circle_members
  for select to authenticated
  using (true);

create policy "cmem_write_own" on public.circle_members
  for all to authenticated
  using (
    user_id = (auth.uid())::text
    or user_id = (select email from auth.users where id = auth.uid())::text
  )
  with check (
    user_id = (auth.uid())::text
    or user_id = (select email from auth.users where id = auth.uid())::text
  );
