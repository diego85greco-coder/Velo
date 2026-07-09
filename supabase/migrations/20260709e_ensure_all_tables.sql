-- ══════════════════════════════════════════════════════════════════════
-- CONSOLIDADO IDEMPOTENTE — v1392
-- Asegura que TODAS las tablas/columnas que el cliente usa existan, para que
-- ningún usuario se tope con "Falta la tabla X". Es 100% seguro correrlo
-- aunque ya tengas partes aplicadas: todo usa IF NOT EXISTS / DROP+CREATE.
-- profiles.id es TEXT (no uuid).
-- ══════════════════════════════════════════════════════════════════════

begin;

-- ── profiles: columnas agregadas a lo largo de la sesión ───────────────
alter table public.profiles add column if not exists buddy_id text references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists buddy_name text;
alter table public.profiles add column if not exists buddy_started_at timestamptz;
alter table public.profiles add column if not exists buddy_available_at timestamptz;
alter table public.profiles add column if not exists vibes_seen jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists onboarding_flags jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists achievements_json text default '{}';

-- ── buddy_requests: solicitudes de compañer@ de apoyo ──────────────────
create table if not exists public.buddy_requests (
  id          uuid primary key default gen_random_uuid(),
  from_id     text not null references public.profiles(id) on delete cascade,
  to_id       text not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists buddy_requests_to_status_idx   on public.buddy_requests(to_id, status);
create index if not exists buddy_requests_from_status_idx on public.buddy_requests(from_id, status);
alter table public.buddy_requests enable row level security;
drop policy if exists buddy_requests_select on public.buddy_requests;
create policy buddy_requests_select on public.buddy_requests
  for select using (auth.uid()::text = from_id or auth.uid()::text = to_id);
drop policy if exists buddy_requests_insert on public.buddy_requests;
create policy buddy_requests_insert on public.buddy_requests
  for insert with check (auth.uid()::text = from_id);
drop policy if exists buddy_requests_update on public.buddy_requests;
create policy buddy_requests_update on public.buddy_requests
  for update using (auth.uid()::text = from_id or auth.uid()::text = to_id);

-- ── vibe_comment_reactions: corazones a comentarios de vibes ───────────
create table if not exists public.vibe_comment_reactions (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.vibe_comments(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (comment_id, user_id)
);
create index if not exists vibe_comment_reactions_comment_idx on public.vibe_comment_reactions(comment_id);
alter table public.vibe_comment_reactions enable row level security;
drop policy if exists vibe_comment_reactions_select on public.vibe_comment_reactions;
create policy vibe_comment_reactions_select on public.vibe_comment_reactions
  for select using (
    exists (
      select 1 from public.vibe_comments c
      join public.vibes v on v.id = c.vibe_id
      where c.id = vibe_comment_reactions.comment_id
        and (
          (v.group_id is null and v.instant_scope = 'public')
          or (v.group_id is null and v.instant_scope = 'private' and (
                auth.uid()::text = v.user_id or auth.uid()::text = any(v.instant_member_ids)))
          or (v.group_id is not null and exists (
                select 1 from public.vibe_groups g where g.id = v.group_id
                  and (g.kind in ('official','public') or auth.uid()::text = g.owner_id or auth.uid()::text = any(g.member_ids))))
        )
    )
  );
drop policy if exists vibe_comment_reactions_insert on public.vibe_comment_reactions;
create policy vibe_comment_reactions_insert on public.vibe_comment_reactions
  for insert with check (auth.uid()::text = user_id);
drop policy if exists vibe_comment_reactions_delete on public.vibe_comment_reactions;
create policy vibe_comment_reactions_delete on public.vibe_comment_reactions
  for delete using (auth.uid()::text = user_id);

-- ── velo_notifications: campana de Actividad (comentarios/reacciones/buddy) ─
create table if not exists public.velo_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  related_id  text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists velo_notifications_user_idx on public.velo_notifications(user_id, is_read, created_at desc);
alter table public.velo_notifications enable row level security;
drop policy if exists velo_notifications_select on public.velo_notifications;
create policy velo_notifications_select on public.velo_notifications
  for select using (auth.uid()::text = user_id);
-- Insert abierto: cualquiera autenticado puede crear una notif PARA otro
-- (ej. "X comentó tu momento"). El cliente solo inserta con datos propios.
drop policy if exists velo_notifications_insert on public.velo_notifications;
create policy velo_notifications_insert on public.velo_notifications
  for insert with check (true);
drop policy if exists velo_notifications_update on public.velo_notifications;
create policy velo_notifications_update on public.velo_notifications
  for update using (auth.uid()::text = user_id);

commit;
