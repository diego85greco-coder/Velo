-- ── 3 grupos oficiales nuevos de Velo (v1419) ──────────────────
-- Orgullo de ser (LGBTQ+), Momentos difíciles, Ser solidarios.
-- Idempotente: on conflict (slug) actualiza título/emoji/descripción.
insert into public.vibe_groups (kind, slug, title, emoji, description, expires_at)
values
  ('official','orgullo',      'Orgullo de ser',       '🏳️‍🌈', 'Un espacio para celebrar quién sos. Comunidad LGBTQ+ y aliades.', null),
  ('official','dificiles',    'Momentos difíciles',   '🫂',    'Contá lo que te pesa. Acá recibís mensajes lindos y aliento.',    null),
  ('official','solidaridad',  'Ser solidarios',       '🤝',    'Compartí una causa o un gesto que ayude a otros.',               null)
on conflict (slug) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  description = excluded.description;
