-- usage_events: analytics mínimo de uso — qué secciones abre la gente.
-- Una fila por apertura de sección (event='page', meta=<id de página>).
-- Solo registra el nombre de la sección, nunca contenido.
create table if not exists public.usage_events (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  event      text not null,
  meta       text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_created_idx on public.usage_events (created_at desc);
create index if not exists usage_events_event_idx   on public.usage_events (event, meta);

alter table public.usage_events enable row level security;
create policy "usage_insert" on public.usage_events
  for insert with check (auth.uid() = user_id);
create policy "usage_select" on public.usage_events
  for select using (true);

-- Nota: el triaje de la Sala de Ayuda usa la columna help_posts.urgencia,
-- que ya existe — no requiere cambios de esquema.
