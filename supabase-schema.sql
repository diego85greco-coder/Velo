-- =============================================================
-- Velo — Complete Supabase Schema
-- Safe to re-run: uses IF NOT EXISTS everywhere
-- =============================================================

-- ── bottles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bottles (
  id          text PRIMARY KEY,
  user_id     text,
  mood        text,
  text        text,
  color       text,
  replied     bool DEFAULT false,
  replied_by  text,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bottles' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON bottles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── broadcasts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target   text,
  subject  text,
  body     text,
  icon     text DEFAULT '📢',
  sender   text DEFAULT 'Velo',
  sent_at  timestamptz DEFAULT now()
);
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'broadcasts' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON broadcasts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── circle_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS circle_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_id  text,
  user_id    text,
  user_name  text,
  user_av    text,
  text       text,
  type       text DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE circle_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'circle_messages' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON circle_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── diary_entries ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diary_entries (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid,
  text       text,
  date_label text,
  ts         bigint
);
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'diary_entries' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON diary_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── guardian_presence ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_presence (
  user_id   text PRIMARY KEY,
  name      text,
  avatar    text,
  bio       text,
  tags      text[],
  status    text DEFAULT 'disponible',
  last_seen timestamptz DEFAULT now(),
  convs     int DEFAULT 0,
  rating    float DEFAULT 5.0
);
ALTER TABLE guardian_presence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'guardian_presence' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON guardian_presence FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── guardian_requests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guardian_requests (
  id            text PRIMARY KEY,
  post_id       text,
  seeker_id     uuid,
  guardian_id   uuid,
  guardian_name text,
  guardian_av   text,
  status        text DEFAULT 'pending',
  support_msg   text,
  rating        int
);
ALTER TABLE guardian_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'guardian_requests' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON guardian_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── happy_posts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS happy_posts (
  id         text PRIMARY KEY,
  user_id    text,
  user_name  text,
  user_av    text,
  emoji      text,
  text       text,
  photo      text,
  anon       bool DEFAULT false,
  reactions  jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE happy_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'happy_posts' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON happy_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── help_posts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS help_posts (
  id         text PRIMARY KEY,
  user_id    uuid,
  user_name  text,
  emoji      text,
  preview    text,
  urgencia   text DEFAULT 'normal',
  anon       bool DEFAULT false,
  taken      bool DEFAULT false,
  taken_by   text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE help_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'help_posts' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON help_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── moderation_flags ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS moderation_flags (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section    text,
  tipo       text,
  gravedad   text,
  content    text,
  user_id    text,
  resolved   bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moderation_flags' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON moderation_flags FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── mood_entries ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mood_entries (
  id       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  uuid,
  date_key text,
  emoji    text,
  label    text,
  note     text,
  UNIQUE (user_id, date_key)
);
ALTER TABLE mood_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mood_entries' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON mood_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── reportes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reportes (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid,
  mensaje    text,
  categoria  text,
  estado     text DEFAULT 'abierto',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reportes' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON reportes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── profiles (IF NOT EXISTS safety) ──────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY,
  nombre     text,
  email      text,
  role       text DEFAULT 'user',
  avatar     text,
  motto      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Realtime subscriptions ────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE
  bottles,
  broadcasts,
  circle_messages,
  guardian_presence,
  guardian_requests,
  happy_posts,
  help_posts,
  moderation_flags;
