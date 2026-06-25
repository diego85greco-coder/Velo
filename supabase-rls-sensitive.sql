-- ============================================================
-- VELO — RLS para tablas con datos sensibles
-- Aplicar en Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================
-- Este archivo complementa supabase-rls-fix.sql y cubre las
-- tablas que quedaron con allow_all (USING true para todos).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- diary_entries — Diario íntimo (solo el dueño puede leer/escribir)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"           ON public.diary_entries;
DROP POLICY IF EXISTS "diary_select_own"    ON public.diary_entries;
DROP POLICY IF EXISTS "diary_insert_own"    ON public.diary_entries;
DROP POLICY IF EXISTS "diary_delete_own"    ON public.diary_entries;

CREATE POLICY "diary_select_own" ON public.diary_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "diary_insert_own" ON public.diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "diary_delete_own" ON public.diary_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- mood_entries — Registro de humor (solo el dueño)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"           ON public.mood_entries;
DROP POLICY IF EXISTS "mood_select_own"     ON public.mood_entries;
DROP POLICY IF EXISTS "mood_insert_own"     ON public.mood_entries;
DROP POLICY IF EXISTS "mood_delete_own"     ON public.mood_entries;

CREATE POLICY "mood_select_own" ON public.mood_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "mood_insert_own" ON public.mood_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mood_delete_own" ON public.mood_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- broadcasts — Notificaciones internas (solo el destinatario)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"              ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_select_own"  ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_insert_auth" ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_update_own"  ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_delete_own"  ON public.broadcasts;

CREATE POLICY "broadcasts_select_own" ON public.broadcasts
  FOR SELECT TO authenticated
  USING (
    to_id = auth.uid()::text
    OR to_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "broadcasts_insert_auth" ON public.broadcasts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "broadcasts_update_own" ON public.broadcasts
  FOR UPDATE TO authenticated
  USING (
    to_id = auth.uid()::text
    OR to_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "broadcasts_delete_own" ON public.broadcasts
  FOR DELETE TO authenticated
  USING (
    to_id = auth.uid()::text
    OR to_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- moderation_flags — Solo el reporter puede ver sus flags
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"             ON public.moderation_flags;
DROP POLICY IF EXISTS "flags_select_reporter" ON public.moderation_flags;
DROP POLICY IF EXISTS "flags_insert_auth"     ON public.moderation_flags;

CREATE POLICY "flags_select_reporter" ON public.moderation_flags
  FOR SELECT TO authenticated
  USING (
    reporter_id = auth.uid()::text
    OR reporter_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "flags_insert_auth" ON public.moderation_flags
  FOR INSERT TO authenticated WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────
-- circle_messages — Solo miembros del círculo
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all"         ON public.circle_messages;
DROP POLICY IF EXISTS "cm_select_member"  ON public.circle_messages;
DROP POLICY IF EXISTS "cm_insert_member"  ON public.circle_messages;

-- Solo pueden leer mensajes de un círculo los usuarios que están en ese círculo
CREATE POLICY "cm_select_member" ON public.circle_messages
  FOR SELECT TO authenticated
  USING (
    circle_id IN (
      SELECT circle_id FROM public.circle_members
      WHERE user_id = auth.uid()::text
         OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "cm_insert_member" ON public.circle_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- FIN
-- Verificar en Dashboard → Authentication → Policies
-- que aparezcan las nuevas políticas y NO aparezca "allow_all"
-- en: diary_entries, mood_entries, broadcasts, moderation_flags, circle_messages
-- ─────────────────────────────────────────────────────────────
