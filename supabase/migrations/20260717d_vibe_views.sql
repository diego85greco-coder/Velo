-- Actividad de historias (Vibes): registrar QUIÉN vio cada historia para que el
-- dueño pueda ver su "Actividad" (vistas + reacciones), estilo Instagram.
-- Se graba una fila por (historia, espectador). Privacidad: solo el dueño de la
-- historia (o el propio espectador) puede leer las vistas — nadie más.

create table if not exists public.vibe_views (
  vibe_id     uuid not null,
  viewer_id   text not null,
  viewer_name text,
  viewer_av   text,
  created_at  timestamptz not null default now(),
  primary key (vibe_id, viewer_id)
);

alter table public.vibe_views enable row level security;

-- Insertar solo la PROPIA vista.
drop policy if exists "vibe_views_insert_own" on public.vibe_views;
create policy "vibe_views_insert_own" on public.vibe_views
  for insert to authenticated
  with check ( viewer_id = auth.uid()::text );

-- Leer: el dueño de la historia ve quién la vio; el espectador ve su propia fila.
drop policy if exists "vibe_views_select" on public.vibe_views;
create policy "vibe_views_select" on public.vibe_views
  for select to authenticated
  using (
    viewer_id = auth.uid()::text
    or exists (
      select 1 from public.vibes v
      where v.id = vibe_views.vibe_id and v.user_id::text = auth.uid()::text
    )
  );

grant select, insert on public.vibe_views to authenticated;
