-- Rediseño de "Compañer@ de apoyo del mes": reemplaza support_matches
-- (le preguntaba "¿sí o no?" a TODOS los favoritos, muy confuso) por un
-- flujo de solicitud + aceptación mutua sobre el pool de gente anotada
-- (profiles.buddy_available_at). El match sugerido al azar, o elegido a
-- mano de la lista, se manda como solicitud — recién es compañer@ del
-- mes cuando el otro lado acepta.
--
-- profiles.buddy_id / buddy_name / buddy_started_at / buddy_available_at
-- ya existían (agregadas fuera de este repo de migraciones) — se
-- re-declaran acá con IF NOT EXISTS para dejar el schema documentado.

begin;

alter table public.profiles add column if not exists buddy_id text references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists buddy_name text;
alter table public.profiles add column if not exists buddy_started_at timestamptz;
alter table public.profiles add column if not exists buddy_available_at timestamptz;

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
for select using (
  auth.uid()::text = from_id or auth.uid()::text = to_id
);

drop policy if exists buddy_requests_insert on public.buddy_requests;
create policy buddy_requests_insert on public.buddy_requests
for insert with check (auth.uid()::text = from_id);

-- Update: quien envió puede cancelar (from_id); quien recibe puede
-- aceptar/rechazar (to_id) — ambos casos son un UPDATE de status.
drop policy if exists buddy_requests_update on public.buddy_requests;
create policy buddy_requests_update on public.buddy_requests
for update using (auth.uid()::text = from_id or auth.uid()::text = to_id);

commit;
