-- ============================================================
-- Velo Community Tables — run in Supabase SQL editor
-- ============================================================

-- Happy Wall posts (shared, visible to all, expire after 24h)
CREATE TABLE IF NOT EXISTS public.happy_posts (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT,
  user_name   TEXT        NOT NULL DEFAULT 'Usuario',
  user_av     TEXT        DEFAULT '',
  emoji       TEXT        DEFAULT '☀️',
  text        TEXT        DEFAULT '',
  photo       TEXT        DEFAULT '',
  anon        BOOLEAN     DEFAULT FALSE,
  reactions   JSONB       DEFAULT '{"💛":0,"🌸":0,"🤗":0,"🌿":0,"✨":0}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.happy_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "happy_select" ON public.happy_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "happy_insert" ON public.happy_posts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "happy_update" ON public.happy_posts FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "happy_delete" ON public.happy_posts FOR DELETE TO anon, authenticated USING (true);

-- Enable realtime for happy_posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.happy_posts;

-- Sala de Ayuda posts (shared, disappear when accompanied)
CREATE TABLE IF NOT EXISTS public.help_posts (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT,
  user_name   TEXT        NOT NULL DEFAULT 'Usuario Anónimo',
  emoji       TEXT        DEFAULT '💙',
  preview     TEXT        NOT NULL,
  urgencia    TEXT        DEFAULT 'normal',
  anon        BOOLEAN     DEFAULT TRUE,
  taken       BOOLEAN     DEFAULT FALSE,
  taken_by    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.help_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_select" ON public.help_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "help_insert" ON public.help_posts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "help_update" ON public.help_posts FOR UPDATE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.help_posts;

-- Al Mar bottles (shared, disappear when replied to)
CREATE TABLE IF NOT EXISTS public.bottles (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT,
  mood        TEXT        DEFAULT '💭',
  text        TEXT        NOT NULL,
  color       TEXT        DEFAULT 'rgba(116,198,157,.12)',
  replied     BOOLEAN     DEFAULT FALSE,
  replied_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bottles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bottles_select" ON public.bottles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "bottles_insert" ON public.bottles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "bottles_update" ON public.bottles FOR UPDATE TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bottles;

-- Círculos de Paz messages (real-time group chat)
CREATE TABLE IF NOT EXISTS public.circle_messages (
  id          BIGSERIAL   PRIMARY KEY,
  circle_id   TEXT        NOT NULL,
  user_id     TEXT,
  user_name   TEXT        NOT NULL DEFAULT 'Usuario',
  user_av     TEXT        DEFAULT '🌿',
  text        TEXT,
  emoji       TEXT,
  type        TEXT        DEFAULT 'text',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS circle_messages_circle_id_idx ON public.circle_messages(circle_id);
ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "circle_msg_select" ON public.circle_messages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "circle_msg_insert" ON public.circle_messages FOR INSERT TO anon, authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;
