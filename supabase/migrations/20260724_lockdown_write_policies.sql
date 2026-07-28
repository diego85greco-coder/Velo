-- ============================================================================
-- CIERRE DE POLICIES DE ESCRITURA ABIERTAS  (2026-07-24)  — CRÍTICO
--
-- Las migraciones de privacidad (20260716h, 20260718b) eliminaron las policies
-- de SELECT abiertas, pero dejaron vivas las de ESCRITURA de la migración
-- original 20260521_community.sql. Las policies permisivas se combinan con OR,
-- así que estas seguían autorizando a `anon` (con la clave pública del cliente):
--
--   diary_entries: diary_insert CHECK(true), diary_delete USING(true)
--   mood_entries:  mood_insert CHECK(true), mood_update/mood_delete USING(true)
--
-- Impacto real: con solo la anon key (que viaja en el cliente),
--   DELETE /rest/v1/diary_entries?id=neq.<uuid>   → borra el diario íntimo de TODOS
--   DELETE /rest/v1/mood_entries?...              → borra todo el historial de ánimo
-- sin login y sin recuperación. En una app de salud mental es catastrófico.
--
-- Fix: escritura OWNER-ONLY. El cliente ya escribe con el uid de la sesión
-- (sbSaveMoodEntry usa auth.getUser().id; el diario usa velo_user_id tras
-- _ensureSbSession), así que los flujos legítimos siguen funcionando igual.
-- Las columnas user_id son TEXT → comparar contra auth.uid()::text.
--
-- Idempotente.
-- ============================================================================

-- ── diary_entries ──────────────────────────────────────────────────────────
drop policy if exists "diary_insert" on public.diary_entries;
drop policy if exists "diary_delete" on public.diary_entries;
drop policy if exists "diary_update" on public.diary_entries;

drop policy if exists diary_insert_own on public.diary_entries;
create policy diary_insert_own on public.diary_entries
  for insert to authenticated with check (user_id = auth.uid()::text);

drop policy if exists diary_update_own on public.diary_entries;
create policy diary_update_own on public.diary_entries
  for update to authenticated using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists diary_delete_own on public.diary_entries;
create policy diary_delete_own on public.diary_entries
  for delete to authenticated using (user_id = auth.uid()::text);

-- ── mood_entries ───────────────────────────────────────────────────────────
drop policy if exists "mood_insert" on public.mood_entries;
drop policy if exists "mood_update" on public.mood_entries;
drop policy if exists "mood_delete" on public.mood_entries;

drop policy if exists mood_insert_own on public.mood_entries;
create policy mood_insert_own on public.mood_entries
  for insert to authenticated with check (user_id = auth.uid()::text);

drop policy if exists mood_update_own on public.mood_entries;
create policy mood_update_own on public.mood_entries
  for update to authenticated using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists mood_delete_own on public.mood_entries;
create policy mood_delete_own on public.mood_entries
  for delete to authenticated using (user_id = auth.uid()::text);

-- Quitar el grant de escritura a anon (defensa en profundidad: sin sesión no se
-- escribe nada en datos privados). El rol `authenticated` queda gobernado por
-- las policies owner-only de arriba.
revoke insert, update, delete on public.diary_entries from anon;
revoke insert, update, delete on public.mood_entries  from anon;

-- ── moderation_flags: no exponer ni dejar auto-resolver los reportes ────────
drop policy if exists "mf_select" on public.moderation_flags;
drop policy if exists "mf_update" on public.moderation_flags;
-- se conserva mf_insert: el cliente necesita poder reportar contenido.
revoke select, update, delete on public.moderation_flags from anon, authenticated;
