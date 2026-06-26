-- ============================================================
-- bitacora_comment_reactions — reacciones en comentarios
-- Run in Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bitacora_comment_reactions (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id TEXT        NOT NULL,
  user_id    TEXT        NOT NULL,
  emoji      TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS bt_cm_rx_comment_idx ON public.bitacora_comment_reactions(comment_id);

ALTER TABLE public.bitacora_comment_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "bt_cm_rx_select" ON public.bitacora_comment_reactions
    FOR SELECT TO anon, authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bt_cm_rx_insert" ON public.bitacora_comment_reactions
    FOR INSERT TO anon, authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "bt_cm_rx_delete" ON public.bitacora_comment_reactions
    FOR DELETE TO anon, authenticated USING (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
