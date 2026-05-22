-- =============================================================
-- Velo — REPAIR SCRIPT (run this if you got SQL errors before)
-- Safe to run on any state: uses IF NOT EXISTS everywhere.
-- This replaces running schema.sql + fase2.sql separately.
-- =============================================================

-- ── BASE TABLES (from schema.sql) ─────────────────────────────

CREATE TABLE IF NOT EXISTS bottles (
  id         text PRIMARY KEY,
  user_id    text,
  mood       text,
  text       text,
  color      text,
  replied    bool DEFAULT false,
  replied_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bottles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bottles' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON bottles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS broadcasts (
  id      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target  text,
  subject text,
  body    text,
  icon    text DEFAULT '📢',
  sender  text DEFAULT 'Velo',
  sent_at timestamptz DEFAULT now()
);
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='broadcasts' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON broadcasts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS circle_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  circle_id  text,
  user_id    text,
  user_name  text,
  user_av    text,
  text       text,
  type       text DEFAULT 'text',
  reactions  jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE circle_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='circle_messages' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON circle_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS diary_entries (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid,
  text       text,
  date_label text,
  ts         bigint
);
ALTER TABLE diary_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='diary_entries' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON diary_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guardian_presence' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON guardian_presence FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS guardian_requests (
  id            text PRIMARY KEY,
  post_id       text,
  kind          text,
  seeker_id     text,
  seeker_name   text,
  seeker_av     text,
  guardian_id   text,
  guardian_name text,
  guardian_av   text,
  status        text DEFAULT 'pending',
  support_msg   text,
  context       text,
  rating        int,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE guardian_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='guardian_requests' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON guardian_requests FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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
  comments   jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE happy_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='happy_posts' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON happy_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS help_posts (
  id         text PRIMARY KEY,
  user_id    text,
  user_name  text,
  emoji      text,
  preview    text,
  urgencia   text DEFAULT 'normal',
  anon       bool DEFAULT false,
  taken      bool DEFAULT false,
  taken_by   text,
  closed     bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE help_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='help_posts' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON help_posts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS moderation_flags (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section    text,
  tipo       text,
  gravedad   text,
  content    text,
  user_id    text,
  resolved   bool DEFAULT false,
  resolution text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='moderation_flags' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON moderation_flags FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mood_entries' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON mood_entries FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reportes' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON reportes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id                uuid PRIMARY KEY,
  nombre            text,
  email             text,
  role              text DEFAULT 'user',
  avatar            text,
  motto             text,
  status_music      text,
  status_book       text,
  status_phrase     text,
  terms_accepted_at timestamptz,
  plus_expires_at   timestamptz,
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── FASE-2 NEW TABLES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_news (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo      text,
  cuerpo      text,
  emoji       text DEFAULT '📰',
  source_url  text,
  source_name text,
  active      bool DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE admin_news ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_news' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON admin_news FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS donations (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email text,
  amount     numeric,
  currency   text DEFAULT 'USD',
  tipo       text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='donations' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON donations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bookings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id     text,
  user_id    text,
  amount     numeric,
  commission numeric,
  estado     text DEFAULT 'pendiente',
  paid       bool DEFAULT false,
  paid_at    timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bookings' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON bookings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reviews (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id     text,
  user_id    text,
  stars      int,
  texto      text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='reviews' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON reviews FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS surveys (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       text,
  general       int,
  utilidad      int,
  recomendaria  int,
  funcion       text,
  sugerencia    text,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='surveys' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON surveys FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS plus_grants (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz
);
ALTER TABLE plus_grants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='plus_grants' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON plus_grants FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS terms_acceptance (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email       text,
  nombre      text,
  accepted_at timestamptz DEFAULT now()
);
ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='terms_acceptance' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON terms_acceptance FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── FAVOURITES + DIRECT MESSAGES (new) ────────────────────────

CREATE TABLE IF NOT EXISTS user_favorites (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    text NOT NULL,
  fav_id     text NOT NULL,
  fav_name   text,
  fav_av     text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, fav_id)
);
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_favorites' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON user_favorites FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS direct_messages (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id    text NOT NULL,
  from_name  text,
  from_av    text,
  to_id      text NOT NULL,
  text       text,
  read       bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='direct_messages' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON direct_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── CONTACTS TABLE (support/contact form submissions) ────────────

CREATE TABLE IF NOT EXISTS contacts (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic       text NOT NULL DEFAULT 'General',
  mensaje     text,
  user_email  text,
  user_name   text,
  user_id     text,
  source      text DEFAULT 'web',
  leido       bool DEFAULT false,
  reply       text,
  allow_reply bool DEFAULT false,
  fecha       timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contacts' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON contacts FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Safe additions for contacts in case it already existed without some columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_name   text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id     text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source      text DEFAULT 'web';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reply       text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS allow_reply bool DEFAULT false;

-- ── SAFE COLUMN ADDITIONS (in case tables existed without them) ─

ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS status_music      text;
ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS status_book       text;
ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS status_phrase     text;
ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles     ADD COLUMN IF NOT EXISTS plus_expires_at   timestamptz;
ALTER TABLE happy_posts  ADD COLUMN IF NOT EXISTS comments          jsonb;
ALTER TABLE help_posts   ADD COLUMN IF NOT EXISTS closed            bool DEFAULT false;
ALTER TABLE help_posts   ADD COLUMN IF NOT EXISTS user_id           text;
ALTER TABLE circle_messages ADD COLUMN IF NOT EXISTS type           text DEFAULT 'text';
ALTER TABLE circle_messages ADD COLUMN IF NOT EXISTS reactions      jsonb;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reactions      jsonb;
ALTER TABLE moderation_flags ADD COLUMN IF NOT EXISTS resolution    text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS seeker_id    text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS guardian_id  text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS kind         text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS seeker_name  text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS seeker_av    text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS guardian_name text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS guardian_av  text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS context      text;
ALTER TABLE guardian_requests ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();
ALTER TABLE guardian_presence ADD COLUMN IF NOT EXISTS is_guardian  bool DEFAULT true;
ALTER TABLE reviews   ADD COLUMN IF NOT EXISTS kind          text;
ALTER TABLE reviews   ADD COLUMN IF NOT EXISTS reviewer_name text;
ALTER TABLE reviews   ADD COLUMN IF NOT EXISTS reviewee_name text;
ALTER TABLE help_posts ADD COLUMN IF NOT EXISTS user_av      text;
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS helped_count   int DEFAULT 0;
ALTER TABLE profiles  ADD COLUMN IF NOT EXISTS received_count int DEFAULT 0;

-- ── REALTIME ──────────────────────────────────────────────────

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'bottles','broadcasts','circle_messages','guardian_presence',
    'guardian_requests','happy_posts','help_posts','moderation_flags',
    'admin_news','user_favorites','direct_messages','contacts'
  ] LOOP
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE ' || tbl;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- ── PHASE 4: CIRCLES + CIRCLE MEMBERS ────────────────────────

-- circle_members: tracks who is currently in a circle (for real-time count)
CREATE TABLE IF NOT EXISTS circle_members (
  circle_id  text NOT NULL,
  user_id    text NOT NULL,
  last_seen  timestamptz DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='circle_members' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON circle_members FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- circles: user-created circles stored in Supabase (multiuser)
CREATE TABLE IF NOT EXISTS circles (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  desc        text,
  emoji       text DEFAULT '⭕',
  foto        text,
  tema        text,
  cap_min     int DEFAULT 5,
  cap_max     int DEFAULT 30,
  creator_id  text,
  official    bool DEFAULT false,
  created_at  timestamptz DEFAULT now()
);
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='circles' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON circles FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Add new tables to realtime publication
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['circle_members','circles'] LOOP
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE ' || tbl;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
