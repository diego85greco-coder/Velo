-- Vibes: comentarios en los momentos.
-- Consigna del feature: mensajes de apoyo, agradecimiento o afecto.
-- Los mensajes fuera de tono se filtran en cliente con Gemini antes de insertar.
--
-- profiles.id es text (no uuid), así que user_id es text y en las policies
-- casteamos auth.uid()::text.

begin;

create table if not exists public.vibe_comments (
  id            uuid primary key default gen_random_uuid(),
  vibe_id       uuid not null references public.vibes(id) on delete cascade,
  user_id       text not null references public.profiles(id) on delete cascade,
  user_name     text,
  user_av       text,
  text          text not null check (length(text) between 1 and 500),
  created_at    timestamptz not null default now()
);

create index if not exists vibe_comments_vibe_idx    on public.vibe_comments(vibe_id);
create index if not exists vibe_comments_created_idx on public.vibe_comments(created_at desc);

alter table public.vibe_comments enable row level security;

-- Ver: si podés ver la vibe, ves sus comentarios.
drop policy if exists vibe_comments_select on public.vibe_comments;
create policy vibe_comments_select on public.vibe_comments
for select using (
  exists (
    select 1 from public.vibes v
    where v.id = vibe_comments.vibe_id
      and (
        -- Instantáneo público: cualquiera
        (v.group_id is null and v.instant_scope = 'public')
        -- Instantáneo privado: autor o invitados
        or (v.group_id is null and v.instant_scope = 'private' and (
              auth.uid()::text = v.user_id
              or auth.uid()::text = any(v.instant_member_ids)
            ))
        -- Vibe en grupo: si podés ver el grupo
        or (v.group_id is not null and exists (
              select 1 from public.vibe_groups g
              where g.id = v.group_id
                and (
                  g.kind in ('official','public')
                  or auth.uid()::text = g.owner_id
                  or auth.uid()::text = any(g.member_ids)
                )
            ))
      )
  )
);

-- Insert: sólo con mi user_id y si tengo acceso a la vibe.
drop policy if exists vibe_comments_insert on public.vibe_comments;
create policy vibe_comments_insert on public.vibe_comments
for insert with check (
  auth.uid()::text = user_id
  and exists (
    select 1 from public.vibes v
    where v.id = vibe_id
      and (
        (v.group_id is null and v.instant_scope = 'public')
        or (v.group_id is null and v.instant_scope = 'private' and (
              auth.uid()::text = v.user_id
              or auth.uid()::text = any(v.instant_member_ids)
            ))
        or (v.group_id is not null and exists (
              select 1 from public.vibe_groups g
              where g.id = v.group_id
                and (
                  g.kind in ('official','public')
                  or auth.uid()::text = g.owner_id
                  or auth.uid()::text = any(g.member_ids)
                )
            ))
      )
  )
);

-- Delete: sólo mi propio comentario, o el autor de la vibe puede curar.
drop policy if exists vibe_comments_delete on public.vibe_comments;
create policy vibe_comments_delete on public.vibe_comments
for delete using (
  auth.uid()::text = user_id
  or exists (
    select 1 from public.vibes v
    where v.id = vibe_comments.vibe_id and v.user_id = auth.uid()::text
  )
);

commit;
