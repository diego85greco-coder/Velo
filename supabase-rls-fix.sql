-- ============================================================
-- VELO — Fix 5 bugs de visibilidad entre usuarios
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- PARTE 1 — Políticas SELECT públicas (leer datos de todos)
-- ─────────────────────────────────────────────────────────────

-- guardian_presence (quién está online en Guardianes)
DROP POLICY IF EXISTS "gp_select"      ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_select_auth" ON public.guardian_presence;
CREATE POLICY "gp_select_auth" ON public.guardian_presence
  FOR SELECT TO authenticated USING (true);

-- bottles (Mensajes al Mar)
DROP POLICY IF EXISTS "bottles_select"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_select_auth" ON public.bottles;
CREATE POLICY "bottles_select_auth" ON public.bottles
  FOR SELECT TO authenticated USING (true);

-- help_posts (Sala de Ayuda)
DROP POLICY IF EXISTS "help_posts_select"      ON public.help_posts;
DROP POLICY IF EXISTS "help_posts_select_auth" ON public.help_posts;
CREATE POLICY "help_posts_select_auth" ON public.help_posts
  FOR SELECT TO authenticated USING (true);

-- happy_posts (Muro de Felicidad)
DROP POLICY IF EXISTS "happy_posts_select"      ON public.happy_posts;
DROP POLICY IF EXISTS "happy_posts_select_auth" ON public.happy_posts;
CREATE POLICY "happy_posts_select_auth" ON public.happy_posts
  FOR SELECT TO authenticated USING (true);

-- profiles (foto + nombre de otros usuarios)
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
CREATE POLICY "profiles_select_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- guardian_requests (flujo de acompañamiento)
DROP POLICY IF EXISTS "gr_select"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_select_auth" ON public.guardian_requests;
CREATE POLICY "gr_select_auth" ON public.guardian_requests
  FOR SELECT TO authenticated USING (true);

-- direct_messages (solo participantes)
DROP POLICY IF EXISTS "dm_select"           ON public.direct_messages;
DROP POLICY IF EXISTS "dm_select_participant" ON public.direct_messages;
CREATE POLICY "dm_select_participant" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    from_id = auth.uid()::text
    OR to_id = auth.uid()::text
    OR from_id = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR to_id   = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- user_favorites (solo los propios)
DROP POLICY IF EXISTS "favs_select"     ON public.user_favorites;
DROP POLICY IF EXISTS "favs_select_own" ON public.user_favorites;
CREATE POLICY "favs_select_own" ON public.user_favorites
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- PARTE 2 — Políticas INSERT / UPDATE / DELETE
-- ─────────────────────────────────────────────────────────────

-- guardian_presence
DROP POLICY IF EXISTS "gp_insert"     ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_update"     ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_insert_own" ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_update_own" ON public.guardian_presence;
CREATE POLICY "gp_insert_own" ON public.guardian_presence
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gp_update_own" ON public.guardian_presence
  FOR UPDATE TO authenticated USING (true);

-- bottles
DROP POLICY IF EXISTS "bottles_insert"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_delete"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_insert_auth" ON public.bottles;
DROP POLICY IF EXISTS "bottles_delete_own"  ON public.bottles;
CREATE POLICY "bottles_insert_auth" ON public.bottles
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bottles_delete_own" ON public.bottles
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- help_posts
DROP POLICY IF EXISTS "hp_insert"       ON public.help_posts;
DROP POLICY IF EXISTS "hp_update"       ON public.help_posts;
DROP POLICY IF EXISTS "hp_delete"       ON public.help_posts;
DROP POLICY IF EXISTS "hp_insert_auth"  ON public.help_posts;
DROP POLICY IF EXISTS "hp_update_own"   ON public.help_posts;
DROP POLICY IF EXISTS "hp_delete_own"   ON public.help_posts;
CREATE POLICY "hp_insert_auth"  ON public.help_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hp_update_own"   ON public.help_posts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hp_delete_own"   ON public.help_posts FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- happy_posts
DROP POLICY IF EXISTS "happ_insert"      ON public.happy_posts;
DROP POLICY IF EXISTS "happ_delete"      ON public.happy_posts;
DROP POLICY IF EXISTS "happ_insert_auth" ON public.happy_posts;
DROP POLICY IF EXISTS "happ_delete_own"  ON public.happy_posts;
CREATE POLICY "happ_insert_auth" ON public.happy_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "happ_delete_own"  ON public.happy_posts FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- profiles
DROP POLICY IF EXISTS "profiles_insert"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_update"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- guardian_requests
DROP POLICY IF EXISTS "gr_insert"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_update"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_insert_auth" ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_update_auth" ON public.guardian_requests;
CREATE POLICY "gr_insert_auth" ON public.guardian_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "gr_update_auth" ON public.guardian_requests FOR UPDATE TO authenticated USING (true);

-- direct_messages
DROP POLICY IF EXISTS "dm_insert"     ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert_own" ON public.direct_messages;
CREATE POLICY "dm_insert_own" ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    from_id = auth.uid()::text
    OR from_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- user_favorites
DROP POLICY IF EXISTS "favs_insert"     ON public.user_favorites;
DROP POLICY IF EXISTS "favs_delete"     ON public.user_favorites;
DROP POLICY IF EXISTS "favs_insert_own" ON public.user_favorites;
DROP POLICY IF EXISTS "favs_delete_own" ON public.user_favorites;
CREATE POLICY "favs_insert_own" ON public.user_favorites FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
CREATE POLICY "favs_delete_own" ON public.user_favorites FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()::text
    OR user_id = (SELECT email FROM auth.users WHERE id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────
-- PARTE 3 — Habilitar Realtime + REPLICA IDENTITY FULL
-- ─────────────────────────────────────────────────────────────

-- Agregar tablas a la publicación supabase_realtime
-- (ignora el error si ya está agregada)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_presence;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bottles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.help_posts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.happy_posts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- REPLICA IDENTITY FULL — necesario para que los filtros client-side
-- funcionen en eventos UPDATE de Supabase Realtime
ALTER TABLE public.guardian_presence  REPLICA IDENTITY FULL;
ALTER TABLE public.bottles            REPLICA IDENTITY FULL;
ALTER TABLE public.help_posts         REPLICA IDENTITY FULL;
ALTER TABLE public.happy_posts        REPLICA IDENTITY FULL;
ALTER TABLE public.guardian_requests  REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages    REPLICA IDENTITY FULL;
ALTER TABLE public.profiles           REPLICA IDENTITY FULL;


-- ─────────────────────────────────────────────────────────────
-- FIN — Verificar que no hubo errores y ejecutar en producción
-- ─────────────────────────────────────────────────────────────
