-- Vibes: momentos comunitarios efímeros (24 h) con reacciones cualitativas.
--
-- Tres capas de grupos:
--   kind='official' — creados por Velo, permanentes, con logo verificado
--   kind='public'   — creados por usuarios, caducan a 24 h
--   kind='private'  — creados por usuarios para un círculo, caducan a 24 h
--
-- Las HISTORIAS individuales (tabla vibes) siempre caducan a 24 h. En grupos
-- 'official' el grupo persiste; sólo las historias se van vaciando.
--
-- El cliente resuelve todo con RLS. Un cron edge function (o pg_cron)
-- deletea las vibes expiradas y los grupos public/private expirados.
--
-- Nota: profiles.id es de tipo text (no uuid), así que todas las FK a
-- profiles(id) usan text. En las policies casteamos auth.uid()::text para
-- comparar con las columnas.

begin;

-- ── Grupos ───────────────────────────────────────────────────────
create table if not exists public.vibe_groups (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('official','public','private')),
  slug          text unique,             -- 'felicidad', 'mascotas', ... solo para official
  title         text not null,
  emoji         text default '🌊',
  description   text,
  owner_id      text references public.profiles(id) on delete cascade, -- null para official
  member_ids    text[] default '{}',     -- lista de invitados para private
  created_at    timestamptz not null default now(),
  expires_at    timestamptz              -- null = permanente (official)
);

create index if not exists vibe_groups_kind_idx    on public.vibe_groups(kind);
create index if not exists vibe_groups_owner_idx   on public.vibe_groups(owner_id);
create index if not exists vibe_groups_expires_idx on public.vibe_groups(expires_at);

alter table public.vibe_groups enable row level security;

-- Ver: cualquier authenticated user ve official + public + los private donde está invitado.
drop policy if exists vibe_groups_select on public.vibe_groups;
create policy vibe_groups_select on public.vibe_groups
for select using (
  kind in ('official','public')
  or auth.uid()::text = owner_id
  or auth.uid()::text = any(member_ids)
);
-- Crear: sólo public/private, y quedan con owner = uid del creador
drop policy if exists vibe_groups_insert on public.vibe_groups;
create policy vibe_groups_insert on public.vibe_groups
for insert with check (
  kind in ('public','private') and auth.uid()::text = owner_id
);
-- Update: sólo el owner
drop policy if exists vibe_groups_update on public.vibe_groups;
create policy vibe_groups_update on public.vibe_groups
for update using (auth.uid()::text = owner_id);
-- Delete: sólo owner (los official los borra un admin manualmente)
drop policy if exists vibe_groups_delete on public.vibe_groups;
create policy vibe_groups_delete on public.vibe_groups
for delete using (auth.uid()::text = owner_id);


-- ── Historias individuales ───────────────────────────────────────
create table if not exists public.vibes (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.vibe_groups(id) on delete cascade,
  user_id       text not null references public.profiles(id) on delete cascade,
  user_name     text,
  user_av       text,
  media_url     text not null,            -- data URL o Supabase Storage URL
  caption       text default '',
  archived      boolean not null default false, -- true = user marcó guardar en historial
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '24 hours')
);

create index if not exists vibes_group_idx    on public.vibes(group_id);
create index if not exists vibes_user_idx     on public.vibes(user_id);
create index if not exists vibes_expires_idx  on public.vibes(expires_at);
create index if not exists vibes_created_idx  on public.vibes(created_at desc);

alter table public.vibes enable row level security;

-- Ver: si podés ver el grupo padre, podés ver sus vibes. RLS se apoya en la
-- policy de vibe_groups vía EXISTS subquery.
drop policy if exists vibes_select on public.vibes;
create policy vibes_select on public.vibes
for select using (
  exists (
    select 1 from public.vibe_groups g
    where g.id = vibes.group_id
      and (
        g.kind in ('official','public')
        or auth.uid()::text = g.owner_id
        or auth.uid()::text = any(g.member_ids)
      )
  )
);
-- Insert: el user que postea = auth.uid(), y tiene que poder ver el grupo.
drop policy if exists vibes_insert on public.vibes;
create policy vibes_insert on public.vibes
for insert with check (
  auth.uid()::text = user_id
  and exists (
    select 1 from public.vibe_groups g
    where g.id = group_id
      and (
        g.kind in ('official','public')
        or auth.uid()::text = g.owner_id
        or auth.uid()::text = any(g.member_ids)
      )
  )
);
-- Update: sólo mis propias vibes (para archived = true, futuro edit caption).
drop policy if exists vibes_update on public.vibes;
create policy vibes_update on public.vibes
for update using (auth.uid()::text = user_id);
-- Delete: el autor puede borrar, o el owner del grupo puede curar.
drop policy if exists vibes_delete on public.vibes;
create policy vibes_delete on public.vibes
for delete using (
  auth.uid()::text = user_id
  or exists (
    select 1 from public.vibe_groups g
    where g.id = vibes.group_id and g.owner_id = auth.uid()::text
  )
);


-- ── Reacciones ───────────────────────────────────────────────────
-- Una reacción por par (vibe, user). Cambiable con UPSERT.
create table if not exists public.vibe_reactions (
  vibe_id       uuid not null references public.vibes(id) on delete cascade,
  user_id       text not null references public.profiles(id) on delete cascade,
  reaction      text not null check (reaction in (
    'alegria','abrazo','acompano','fuerzas','gracias','me_hace_bien','animos','me_inspira'
  )),
  created_at    timestamptz not null default now(),
  primary key (vibe_id, user_id)
);

create index if not exists vibe_reactions_vibe_idx on public.vibe_reactions(vibe_id);

alter table public.vibe_reactions enable row level security;

-- Ver: si podés ver la vibe, ves sus reactions.
drop policy if exists vibe_reactions_select on public.vibe_reactions;
create policy vibe_reactions_select on public.vibe_reactions
for select using (
  exists (
    select 1 from public.vibes v
    join public.vibe_groups g on g.id = v.group_id
    where v.id = vibe_reactions.vibe_id
      and (
        g.kind in ('official','public')
        or auth.uid()::text = g.owner_id
        or auth.uid()::text = any(g.member_ids)
      )
  )
);
-- Insert/Upsert: solo mi propia reacción.
drop policy if exists vibe_reactions_insert on public.vibe_reactions;
create policy vibe_reactions_insert on public.vibe_reactions
for insert with check (auth.uid()::text = user_id);
drop policy if exists vibe_reactions_update on public.vibe_reactions;
create policy vibe_reactions_update on public.vibe_reactions
for update using (auth.uid()::text = user_id);
drop policy if exists vibe_reactions_delete on public.vibe_reactions;
create policy vibe_reactions_delete on public.vibe_reactions
for delete using (auth.uid()::text = user_id);


-- ── Seed de grupos oficiales de Velo ────────────────────────────
insert into public.vibe_groups (kind, slug, title, emoji, description, expires_at)
values
  ('official','felicidad',   'Momentos de felicidad',       '🌞', 'Compartí lo que te trae alegría hoy',                    null),
  ('official','mascotas',    'Nuestras mascotas',           '🐾', 'Nuestros compañeros de patas',                            null),
  ('official','lectura',     'Momentos de lectura',         '📖', 'Libros, pasajes, rincones donde leemos',                  null),
  ('official','ejercicio',   'Momentos de ejercicio',       '💪', 'Movimiento, cuerpos, respiración',                        null),
  ('official','entretenimiento','Momentos de entretenimiento','🎭', 'Series, películas, juegos que nos absorben',            null),
  ('official','conciertos',  'Momentos de conciertos',      '🎵', 'Música en vivo, escenarios, energía compartida',          null),
  ('official','comidas',     'Nuestras comidas preferidas', '🍽️', 'Platos, momentos y sabores que celebramos',              null)
on conflict (slug) do update set
  title = excluded.title,
  emoji = excluded.emoji,
  description = excluded.description;

commit;
