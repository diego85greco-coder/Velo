-- Reacciones (❤️) a comentarios de vibes. Toggle simple: 1 corazón por
-- usuario por comentario. Reusa la misma cadena de visibilidad que
-- vibe_comments (si podés ver el comentario, podés reaccionarlo).
--
-- profiles.id es text, así que user_id es text.

begin;

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

drop policy if exists vibe_comment_reactions_insert on public.vibe_comment_reactions;
create policy vibe_comment_reactions_insert on public.vibe_comment_reactions
for insert with check (auth.uid()::text = user_id);

drop policy if exists vibe_comment_reactions_delete on public.vibe_comment_reactions;
create policy vibe_comment_reactions_delete on public.vibe_comment_reactions
for delete using (auth.uid()::text = user_id);

commit;
