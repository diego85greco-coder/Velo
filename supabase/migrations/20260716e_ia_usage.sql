-- Enforcement server-side del límite de Velo IA (Acompañante IA).
-- Plan gratuito: 25 mensajes / 24 h. Plus: sin límite.
-- Una fila por mensaje enviado a la IA; el cliente inserta ANTES de responder y
-- si el servidor lo rechaza (tope alcanzado) no llama a la IA. Así el cupo no se
-- puede saltear editando la consola.

create table if not exists public.ia_usage (
  id         bigint generated always as identity primary key,
  user_id    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ia_usage_user_time_idx on public.ia_usage (user_id, created_at desc);

alter table public.ia_usage enable row level security;

-- Permisiva: cada quien inserta lo suyo.
drop policy if exists "ia_usage_insert_own" on public.ia_usage;
create policy "ia_usage_insert_own"
  on public.ia_usage
  for insert
  to authenticated
  with check ( user_id = auth.uid()::text );

-- Restrictiva (AND): tope de 25 en 24 h salvo Plus.
drop policy if exists "ia_usage_daily_limit" on public.ia_usage;
create policy "ia_usage_daily_limit"
  on public.ia_usage
  as restrictive
  for insert
  to authenticated
  with check (
    public.velo_is_premium(auth.uid()::text)
    or (
      select count(*) from public.ia_usage u
      where u.user_id = auth.uid()::text
        and u.created_at > now() - interval '24 hours'
    ) < 25
  );

-- (Opcional) permitir leer lo propio, por si se quiere mostrar "te quedan N".
drop policy if exists "ia_usage_select_own" on public.ia_usage;
create policy "ia_usage_select_own"
  on public.ia_usage
  for select
  to authenticated
  using ( user_id = auth.uid()::text );
