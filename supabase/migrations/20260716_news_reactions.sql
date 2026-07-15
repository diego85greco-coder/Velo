-- news_reactions: reacciones comunitarias a las Buenas Noticias
-- (🌞 me alegró · 💛 me encantó · 🌱 me dio esperanza) + "la que más alegró hoy".
-- Las noticias no tienen ID global (se generan por día), así que la clave es
-- el título normalizado (news_key). Guardamos titulo/emoji desnormalizados para
-- poder mostrar el TOP del día aunque esa noticia no esté en tu lista local.
create table if not exists public.news_reactions (
  id         bigint generated always as identity primary key,
  news_key   text not null,
  titulo     text,
  emoji_news text,
  reaction   text not null,           -- 'alegro' | 'amor' | 'esperanza'
  user_id    uuid not null,
  date_key   text not null,           -- YYYY-MM-DD local del cliente
  created_at timestamptz not null default now(),
  unique(news_key, user_id, reaction)
);

create index if not exists news_reactions_key_idx  on public.news_reactions (news_key);
create index if not exists news_reactions_date_idx on public.news_reactions (date_key);

alter table public.news_reactions enable row level security;

create policy "news_rx_select" on public.news_reactions
  for select using (true);
create policy "news_rx_insert" on public.news_reactions
  for insert with check (auth.uid() = user_id);
create policy "news_rx_delete" on public.news_reactions
  for delete using (auth.uid() = user_id);
