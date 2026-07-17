-- ============================================================================
-- RLS AUDIT LOCKDOWN — 2026-07-17
-- Cierra fugas donde el rol anon/authenticated podía leer datos privados
-- (qual = true / ALL {anon,authenticated} true/true).
--
-- Idempotente: DROP POLICY IF EXISTS por nombre exacto del dump + CREATE.
-- Seguro para Realtime: se conservan filtros por seeker_id/guardian_id/post_id,
-- user_id, fav_id — las suscripciones siguen funcionando porque el usuario
-- involucrado sigue teniendo SELECT sobre sus propias filas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) guardian_requests  🔴  gr_all = ALL {anon,authenticated} true/true
--    Fuga: cualquiera leía todas las solicitudes de guardián.
--    Se conserva guardian_requests_daily_limit (INSERT restrictive).
-- ----------------------------------------------------------------------------
drop policy if exists "gr_all" on public.guardian_requests;

create policy "gr_select_involved" on public.guardian_requests
  for select using (
    seeker_id   = auth.uid()::text
    or guardian_id = auth.uid()::text
    or velo_is_admin()
  );

create policy "gr_insert_seeker" on public.guardian_requests
  for insert with check (
    seeker_id = auth.uid()::text
  );

create policy "gr_update_involved" on public.guardian_requests
  for update using (
    seeker_id   = auth.uid()::text
    or guardian_id = auth.uid()::text
  ) with check (
    seeker_id   = auth.uid()::text
    or guardian_id = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 2) velo_notifications  🔴  select_own/update_own tenían USING true (mal nombre)
--    Fuga: cualquiera leía las notificaciones de todos.
--    insert_all se conserva: las notificaciones las crea otro usuario para vos.
-- ----------------------------------------------------------------------------
drop policy if exists "select_own" on public.velo_notifications;
drop policy if exists "update_own" on public.velo_notifications;

create policy "select_own" on public.velo_notifications
  for select using (
    user_id::text = auth.uid()::text
    or velo_is_admin()
  );

create policy "update_own" on public.velo_notifications
  for update using (
    user_id::text = auth.uid()::text
  ) with check (
    user_id::text = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 3) user_favorites  🔴  allow_all (ALL true/true) + public_delete (DELETE true)
--    Fuga: cualquiera leía/borraba favoritos ajenos.
--    La app lee ambas direcciones (user_id=yo y fav_id=yo → _theyFavoriteMe),
--    por eso el SELECT cubre las dos. Se conservan las policies own_*.
-- ----------------------------------------------------------------------------
drop policy if exists "allow_all" on public.user_favorites;
drop policy if exists "public_delete" on public.user_favorites;

create policy "favs_select_involved" on public.user_favorites
  for select using (
    user_id = auth.uid()::text
    or fav_id = auth.uid()::text
  );

-- ----------------------------------------------------------------------------
-- 4) usage_events  🟠  usage_select = SELECT true
--    Fuga: cualquiera leía la telemetría de uso de todos.
--    Solo el panel admin lee esta tabla → restringir a admin.
--    usage_insert se conserva (WITH CHECK auth.uid()=user_id).
-- ----------------------------------------------------------------------------
drop policy if exists "usage_select" on public.usage_events;

create policy "usage_select_admin" on public.usage_events
  for select using ( velo_is_admin() );

-- ----------------------------------------------------------------------------
-- 5) surveys  🟠  allow_all = ALL {anon,authenticated} true/true
--    Fuga: cualquiera leía las respuestas de encuestas de todos.
--    Insert propio + lectura solo admin.
-- ----------------------------------------------------------------------------
drop policy if exists "allow_all" on public.surveys;

create policy "surveys_insert_own" on public.surveys
  for insert with check (
    user_id = auth.uid()::text or user_id is null
  );

create policy "surveys_select_admin" on public.surveys
  for select using ( velo_is_admin() );

-- ----------------------------------------------------------------------------
-- 6) bottles / bottle_reactions  🟠  *_all = ALL {anon,authenticated} true/true
--    Feature oculta actualmente. Deanonimiza (expone user_id).
--    Restringir lectura a dueño; escritura propia.
-- ----------------------------------------------------------------------------
drop policy if exists "bottles_all" on public.bottles;

create policy "bottles_select_own" on public.bottles
  for select using ( user_id = auth.uid()::text or velo_is_admin() );

create policy "bottles_insert_own" on public.bottles
  for insert with check ( user_id = auth.uid()::text );

-- ============================================================================
-- FIN. Verificá después con:
--   select tablename, policyname, cmd, roles, qual
--   from pg_policies
--   where schemaname='public'
--     and tablename in ('guardian_requests','velo_notifications',
--                       'user_favorites','usage_events','surveys','bottles')
--   order by tablename, cmd;
-- ============================================================================
