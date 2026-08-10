-- ============================================================================
-- CONSOLIDAR LAS POLICIES DUPLICADAS DE DIARIO Y ÁNIMOS (07/08/2026) — APLICADA
--
-- Las dos tablas más sensibles tenían policies solapadas, resto de haberlas ido
-- endureciendo por capas: una `FOR ALL` vieja de la migración original, más las
-- de SELECT/INSERT/DELETE añadidas el 24/07. Cada consulta evaluaba varias.
--
-- Además, las viejas estaban concedidas `TO public`, que incluye a `anon`. No
-- era explotable —su condición es `auth.uid() = user_id`, y sin sesión
-- auth.uid() es NULL, que no iguala nada— pero era una policy sobre el diario
-- íntimo concedida a un rol sin sesión.
--
-- ⚠️ EL DETALLE QUE CASI SE PASA POR ALTO: las `FOR ALL` eran las ÚNICAS que
-- autorizaban UPDATE. Al quitarlas hay que crear la de UPDATE explícitamente, o
-- editar una entrada del diario deja de funcionar en silencio.
--
-- Resultado: 4 policies por tabla, una por operación, todas `TO authenticated`.
-- Moderación puede LEER (hace falta para atender un reporte) pero no escribir
-- ni borrar.
--
-- VERIFICADO en producción:
--   * Usuario normal: ve sólo lo suyo (0 filas ajenas en diario y en ánimos).
--   * Las 4 operaciones propias funcionan, incluida la edición.
--   * Moderación lee lo ajeno (2) pero borrar da 0 filas.
--   * El autor sí borra lo suyo (1 fila).
-- ============================================================================

drop policy if exists users_own_diary   on public.diary_entries;
drop policy if exists diary_select_own  on public.diary_entries;
drop policy if exists diary_insert_own  on public.diary_entries;
drop policy if exists diary_update_own  on public.diary_entries;
drop policy if exists diary_delete_own  on public.diary_entries;

create policy diary_select_own on public.diary_entries
  for select to authenticated
  using ( user_id = (select auth.uid()) or public.velo_is_admin() );
create policy diary_insert_own on public.diary_entries
  for insert to authenticated with check ( user_id = (select auth.uid()) );
create policy diary_update_own on public.diary_entries
  for update to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );
create policy diary_delete_own on public.diary_entries
  for delete to authenticated using ( user_id = (select auth.uid()) );

drop policy if exists users_own_moods  on public.mood_entries;
drop policy if exists delete_own_moods on public.mood_entries;
drop policy if exists mood_select_own  on public.mood_entries;
drop policy if exists mood_insert_own  on public.mood_entries;
drop policy if exists mood_update_own  on public.mood_entries;
drop policy if exists mood_delete_own  on public.mood_entries;

create policy mood_select_own on public.mood_entries
  for select to authenticated
  using ( user_id = (select auth.uid()) or public.velo_is_admin() );
create policy mood_insert_own on public.mood_entries
  for insert to authenticated with check ( user_id = (select auth.uid()) );
create policy mood_update_own on public.mood_entries
  for update to authenticated
  using ( user_id = (select auth.uid()) ) with check ( user_id = (select auth.uid()) );
create policy mood_delete_own on public.mood_entries
  for delete to authenticated using ( user_id = (select auth.uid()) );

revoke all on public.diary_entries from anon;
revoke all on public.mood_entries  from anon;
