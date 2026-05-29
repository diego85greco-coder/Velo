-- ── user_blocks table ────────────────────────────────────────
-- Tracks who blocked whom. When user A blocks B:
--   - A cannot see B in their contacts (handled client-side via velo_blocked)
--   - B silently cannot see A in their contacts (filtered via this table)
-- Run this in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS user_blocks (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id  uuid NOT NULL,
  blocked_id  uuid NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_blocks' AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON user_blocks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Index for fast lookup: "has anyone blocked me?"
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_id ON user_blocks (blocked_id);
-- Index for: "who have I blocked?"
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id ON user_blocks (blocker_id);
