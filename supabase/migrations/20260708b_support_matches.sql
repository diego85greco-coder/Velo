-- Compañer@ de apoyo del mes: pareja de acompañamiento entre 2 favoritos.
--
-- Cada mes ambos tienen que confirmar que quieren renovar como compañer@s.
-- Si ambos aceptan → aparece el badge "🌱 Compañer@ del mes".
-- Si uno rechaza (o no responde en el plazo) → no hay match ese mes.
--
-- Registros simétricos: (user_id=A, partner_id=B) y (user_id=B, partner_id=A)
-- para poder guardar la respuesta INDEPENDIENTE de cada lado.
--
-- profiles.id es text.

begin;

create table if not exists public.support_matches (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  partner_id  text not null references public.profiles(id) on delete cascade,
  month_key   text not null,        -- 'YYYY-MM'
  my_answer   text not null default 'pending' check (my_answer in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, partner_id, month_key)
);

create index if not exists support_matches_user_month_idx    on public.support_matches(user_id, month_key);
create index if not exists support_matches_partner_month_idx on public.support_matches(partner_id, month_key);

alter table public.support_matches enable row level security;

-- Ver: cada uno ve tanto su respuesta como la del partner (para saber si es match)
drop policy if exists support_matches_select on public.support_matches;
create policy support_matches_select on public.support_matches
for select using (
  auth.uid()::text = user_id
  or auth.uid()::text = partner_id
);

-- Insert / update: sólo el registro donde YO soy user_id
drop policy if exists support_matches_insert on public.support_matches;
create policy support_matches_insert on public.support_matches
for insert with check (auth.uid()::text = user_id);

drop policy if exists support_matches_update on public.support_matches;
create policy support_matches_update on public.support_matches
for update using (auth.uid()::text = user_id);

drop policy if exists support_matches_delete on public.support_matches;
create policy support_matches_delete on public.support_matches
for delete using (auth.uid()::text = user_id);

commit;
