-- Add debate postura columns to bitacora_posts (missing from original schema)
ALTER TABLE public.bitacora_posts
  ADD COLUMN IF NOT EXISTS postura_a TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS postura_b TEXT DEFAULT '';

-- Add reactions JSONB column for bitacora reactions (apoyo, resuena, etc.)
ALTER TABLE public.bitacora_posts
  ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';

-- Recreate bitacora_posts_full view to include author_username from profiles
-- (needed for @username display in cards)
CREATE OR REPLACE VIEW public.bitacora_posts_full AS
  SELECT
    bp.*,
    p.username AS author_username,
    p.nombre   AS author_name,
    p.avatar   AS author_avatar
  FROM public.bitacora_posts bp
  LEFT JOIN public.profiles p ON p.id = bp.user_id;
