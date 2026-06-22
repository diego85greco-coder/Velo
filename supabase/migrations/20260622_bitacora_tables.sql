-- ============================================================
-- Bitácora tables — reactions, comments, reports
-- Run in Supabase SQL editor
-- NOTE: All IDs/user_ids use TEXT to match the app's convention
-- ============================================================

-- bitacora_reactions: one row per (post, user, reaction_type)
CREATE TABLE IF NOT EXISTS public.bitacora_reactions (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id       TEXT        NOT NULL,
  user_id       TEXT        NOT NULL,
  reaction_type TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, reaction_type)
);
CREATE INDEX IF NOT EXISTS bitacora_reactions_post_idx ON public.bitacora_reactions(post_id);
ALTER TABLE public.bitacora_reactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bt_rx_select" ON public.bitacora_reactions FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_rx_insert" ON public.bitacora_reactions FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_rx_delete" ON public.bitacora_reactions FOR DELETE TO anon, authenticated USING (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enable realtime for reactions (needed for _btSubscribeDetail)
ALTER PUBLICATION supabase_realtime ADD TABLE public.bitacora_reactions;

-- bitacora_comments
CREATE TABLE IF NOT EXISTS public.bitacora_comments (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    TEXT        NOT NULL,
  user_id    TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  is_anon    BOOLEAN     DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bitacora_comments_post_idx ON public.bitacora_comments(post_id);
ALTER TABLE public.bitacora_comments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bt_cm_select" ON public.bitacora_comments FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_cm_insert" ON public.bitacora_comments FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_cm_delete" ON public.bitacora_comments FOR DELETE TO anon, authenticated USING (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- bitacora_comments_full view (with author info from profiles)
DROP VIEW IF EXISTS public.bitacora_comments_full;
CREATE VIEW public.bitacora_comments_full AS
  SELECT
    bc.*,
    p.username AS author_username,
    p.nombre   AS author_name,
    p.avatar   AS author_avatar
  FROM public.bitacora_comments bc
  LEFT JOIN public.profiles p ON p.id::text = bc.user_id;

-- bitacora_reports (moderation)
CREATE TABLE IF NOT EXISTS public.bitacora_reports (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    TEXT,
  post_id    TEXT,
  comment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bitacora_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bt_rp_select" ON public.bitacora_reports FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_rp_insert" ON public.bitacora_reports FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "bt_rp_delete" ON public.bitacora_reports FOR DELETE TO authenticated USING (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
