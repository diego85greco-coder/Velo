-- ============================================================
-- VELO — Migración: Sistema @username
-- Ejecutar completo en Supabase SQL Editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PASO 1 — Agregar columna username a profiles
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Índice de unicidad (partial: solo aplica cuando username no es null ni vacío)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (username)
  WHERE username IS NOT NULL AND username <> '';

-- Índice para búsqueda rápida por @usuario
CREATE INDEX IF NOT EXISTS profiles_username_idx
  ON public.profiles (username);

-- ─────────────────────────────────────────────────────────────
-- PASO 2 — RLS: el username es visible para todos los users
-- ─────────────────────────────────────────────────────────────
-- Ya cubierto por la política "profiles_select_auth" del script anterior.
-- Si por algún motivo no existe, ejecutar:
/*
DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
CREATE POLICY "profiles_select_auth" ON public.profiles
  FOR SELECT TO authenticated USING (true);
*/

-- ─────────────────────────────────────────────────────────────
-- PASO 3 — UPDATE: usuario solo puede actualizar su propio username
-- ─────────────────────────────────────────────────────────────
-- Ya cubierto por la política "profiles_update_own" del script anterior
-- (permite UPDATE de cualquier campo en la propia fila).
-- No se necesita SQL adicional.

-- ─────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- ─────────────────────────────────────────────────────────────
-- Después de ejecutar, verificar que la columna existe:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'username';

-- ─────────────────────────────────────────────────────────────
-- FIN — Sin errores = listo para usar
-- ─────────────────────────────────────────────────────────────
