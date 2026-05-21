-- =============================================================
-- Velo — Fase 2 Schema (panel admin)
-- Safe to re-run: IF NOT EXISTS everywhere
-- =============================================================

-- ── admin_news ────────────────────────────────────────────────
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

-- ── donations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS donations (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email text,
  amount     numeric,
  currency   text DEFAULT 'USD',
  tipo       text DEFAULT 'donation',  -- donation | plus | pro-sub
  created_at timestamptz DEFAULT now()
);
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='donations' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON donations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── bookings (sesiones profesionales, comisión 20%) ───────────
CREATE TABLE IF NOT EXISTS bookings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id     text,
  pro_name   text,
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

-- ── reviews ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pro_id     text,
  pro_name   text,
  user_id    text,
  user_name  text,
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

-- ── surveys (encuestas de satisfacción) ───────────────────────
CREATE TABLE IF NOT EXISTS surveys (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text,
  general      int,
  utilidad     int,
  recomendaria int,
  funcion      text,
  sugerencia   text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='surveys' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON surveys FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── plus_grants (Velo Plus gratis 30 días) ────────────────────
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

-- ── terms_acceptance (auditoría legal) ────────────────────────
CREATE TABLE IF NOT EXISTS terms_acceptance (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email       text,
  nombre      text,
  rol         text DEFAULT 'user',
  accepted_at timestamptz DEFAULT now()
);
ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='terms_acceptance' AND policyname='allow_all') THEN
    CREATE POLICY "allow_all" ON terms_acceptance FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── columns added to existing tables ──────────────────────────
ALTER TABLE moderation_flags ADD COLUMN IF NOT EXISTS resolution text;
ALTER TABLE happy_posts ADD COLUMN IF NOT EXISTS comments jsonb;
ALTER TABLE circle_messages ADD COLUMN IF NOT EXISTS type text DEFAULT 'text';
ALTER TABLE circle_messages ADD COLUMN IF NOT EXISTS reactions jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plus_expires_at timestamptz;

-- ── Realtime ──────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE admin_news;
