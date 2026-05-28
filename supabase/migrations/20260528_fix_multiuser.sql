-- ============================================================
-- Velo — Fix multiuser: column types + missing columns + RLS
-- Run this in Supabase SQL Editor (safe to re-run)
--
-- ORDER MATTERS: we DROP all policies BEFORE altering column types,
-- because Postgres refuses to alter a column type while a policy
-- depends on that column (error 0A000).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Create tables if they don't exist yet
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guardian_requests (
  id text PRIMARY KEY, post_id text, seeker_id text, guardian_id text,
  guardian_name text, guardian_av text, status text DEFAULT 'pending',
  support_msg text, rating int, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bottles (
  id text PRIMARY KEY, user_id text, mood text, text text, color text,
  replied boolean DEFAULT false, replied_by text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.help_posts (
  id text PRIMARY KEY, user_id text, user_name text, emoji text, preview text,
  urgencia text DEFAULT 'normal', anon boolean DEFAULT false,
  taken boolean DEFAULT false, taken_by text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id text NOT NULL, from_name text, from_av text,
  to_id text NOT NULL, text text, read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. DROP all policies FIRST (so column types can be altered)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.guardian_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_select_auth" ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_insert_auth" ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_update_auth" ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_select"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_insert"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_update"      ON public.guardian_requests;
DROP POLICY IF EXISTS "gr_all"         ON public.guardian_requests;

ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"           ON public.bottles;
DROP POLICY IF EXISTS "bottles_select_auth" ON public.bottles;
DROP POLICY IF EXISTS "bottles_insert_auth" ON public.bottles;
DROP POLICY IF EXISTS "bottles_delete_own"  ON public.bottles;
DROP POLICY IF EXISTS "bottles_select"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_insert"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_update"      ON public.bottles;
DROP POLICY IF EXISTS "bottles_all"         ON public.bottles;

ALTER TABLE public.help_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"          ON public.help_posts;
DROP POLICY IF EXISTS "help_posts_select_auth" ON public.help_posts;
DROP POLICY IF EXISTS "hp_insert_auth"     ON public.help_posts;
DROP POLICY IF EXISTS "hp_update_own"      ON public.help_posts;
DROP POLICY IF EXISTS "hp_delete_own"      ON public.help_posts;
DROP POLICY IF EXISTS "help_select"        ON public.help_posts;
DROP POLICY IF EXISTS "help_insert"        ON public.help_posts;
DROP POLICY IF EXISTS "help_update"        ON public.help_posts;
DROP POLICY IF EXISTS "help_all"           ON public.help_posts;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"             ON public.direct_messages;
DROP POLICY IF EXISTS "dm_select"             ON public.direct_messages;
DROP POLICY IF EXISTS "dm_select_participant" ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert"             ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert_own"         ON public.direct_messages;
DROP POLICY IF EXISTS "dm_all"                ON public.direct_messages;

ALTER TABLE public.guardian_presence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"      ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_select_auth" ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_insert_own"  ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_update_own"  ON public.guardian_presence;
DROP POLICY IF EXISTS "gp_all"         ON public.guardian_presence;

ALTER TABLE public.happy_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all"           ON public.happy_posts;
DROP POLICY IF EXISTS "happy_posts_select_auth" ON public.happy_posts;
DROP POLICY IF EXISTS "happ_insert_auth"    ON public.happy_posts;
DROP POLICY IF EXISTS "happ_delete_own"     ON public.happy_posts;
DROP POLICY IF EXISTS "happy_select"        ON public.happy_posts;
DROP POLICY IF EXISTS "happy_insert"        ON public.happy_posts;
DROP POLICY IF EXISTS "happy_update"        ON public.happy_posts;
DROP POLICY IF EXISTS "happy_delete"        ON public.happy_posts;
DROP POLICY IF EXISTS "happy_all"           ON public.happy_posts;

-- ─────────────────────────────────────────────────────────────
-- 3. NOW alter column types (no policies depend on them anymore)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.guardian_requests
  ALTER COLUMN seeker_id   TYPE text USING seeker_id::text,
  ALTER COLUMN guardian_id TYPE text USING guardian_id::text;

ALTER TABLE public.help_posts
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.direct_messages
  ALTER COLUMN from_id TYPE text USING from_id::text,
  ALTER COLUMN to_id   TYPE text USING to_id::text;

-- ─────────────────────────────────────────────────────────────
-- 4. Add missing columns the JS code inserts
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.guardian_requests ADD COLUMN IF NOT EXISTS seeker_name text;
ALTER TABLE public.guardian_requests ADD COLUMN IF NOT EXISTS seeker_av   text;
ALTER TABLE public.guardian_requests ADD COLUMN IF NOT EXISTS kind        text DEFAULT 'post';
ALTER TABLE public.guardian_requests ADD COLUMN IF NOT EXISTS context     text;
ALTER TABLE public.guardian_requests ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS user_name text;
ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS user_av   text;
ALTER TABLE public.bottles ADD COLUMN IF NOT EXISTS anon      boolean DEFAULT false;

-- ─────────────────────────────────────────────────────────────
-- 5. Create open RLS policies (anon + authenticated)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "gr_all"      ON public.guardian_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "bottles_all" ON public.bottles           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "help_all"    ON public.help_posts         FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dm_all"      ON public.direct_messages    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "gp_all"      ON public.guardian_presence  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "happy_all"   ON public.happy_posts        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 6. Enable Realtime + REPLICA IDENTITY FULL
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bottles;           EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.help_posts;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.happy_posts;       EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.guardian_presence; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;   EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.guardian_requests  REPLICA IDENTITY FULL;
ALTER TABLE public.bottles            REPLICA IDENTITY FULL;
ALTER TABLE public.help_posts         REPLICA IDENTITY FULL;
ALTER TABLE public.happy_posts        REPLICA IDENTITY FULL;
ALTER TABLE public.guardian_presence  REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages    REPLICA IDENTITY FULL;
