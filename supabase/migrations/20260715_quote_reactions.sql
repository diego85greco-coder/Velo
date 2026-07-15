-- quote_reactions: reacciones a la "Reflexión del día" del home
-- (🌱 me tocó · 💭 me hizo pensar · 💪 me dio fuerza). Una fila por
-- usuario+día+emoji; el cliente hace toggle (insert/delete propio).
create table if not exists public.quote_reactions (
  id         bigint generated always as identity primary key,
  date_key   text not null,          -- YYYY-MM-DD local del cliente
  user_id    uuid not null,
  emoji      text not null,          -- 'toco' | 'pensar' | 'fuerza'
  created_at timestamptz not null default now(),
  unique(date_key, user_id, emoji)
);

create index if not exists quote_reactions_date_idx
  on public.quote_reactions (date_key);

alter table public.quote_reactions enable row level security;

-- Todos pueden ver los contadores; cada uno solo escribe/borra lo suyo.
create policy "quote_rx_select" on public.quote_reactions
  for select using (true);
create policy "quote_rx_insert" on public.quote_reactions
  for insert with check (auth.uid() = user_id);
create policy "quote_rx_delete" on public.quote_reactions
  for delete using (auth.uid() = user_id);
