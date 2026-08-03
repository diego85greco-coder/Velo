-- ============================================================================
-- TABLAS QUE EL CÓDIGO USA Y NO EXISTÍAN  (2026-07-30) — APLICADA en prod
--
-- Encontradas cruzando cada from('...') de premium.js con el esquema real.
-- Las tres que se crean acá tienen valor propio; las otras cuatro que faltaban
-- pertenecen a módulos retirados y NO se crean.
--
--   * `bot_attempts`     — intentos bloqueados por el anti-bot del registro.
--                          No quedaba constancia de ninguno.
--   * `data_requests`    — solicitudes RGPD atendidas. Es la prueba de que se
--                          respondió a un ejercicio de derechos (art. 5.2).
--                          Sólo quedaba en el localStorage del navegador del
--                          admin, que se pierde al limpiar el navegador.
--   * `deleted_accounts` — conteo de cuentas borradas que el panel muestra.
--
-- NO se crean (módulos retirados; sus llamadas siguen fallando en silencio):
--   `solidarity_requests` y `pro_patient_notes` — de "Vela por Ti" y del módulo
--   de profesionales. Vela decía "te contactaremos en 7-14 días" y no guardaba
--   nada; en v1623 se le quitó el acceso por enlace directo (#vela), que era la
--   única forma de llegar desde que se ocultaron los botones.
--   `moods` — era un nombre equivocado de `mood_entries`; arreglado en el
--   cliente. Hacía que el informe de una solicitud RGPD dijera SIEMPRE
--   "0 registros de ánimo".
-- ============================================================================

create table if not exists public.bot_attempts (
  id     bigint generated always as identity primary key,
  reason text,
  ua     text,
  ts     timestamptz not null default now()
);
alter table public.bot_attempts enable row level security;
drop policy if exists bot_attempts_insert_any on public.bot_attempts;
create policy bot_attempts_insert_any on public.bot_attempts
  for insert to anon, authenticated with check (true);
drop policy if exists bot_attempts_select_admin on public.bot_attempts;
create policy bot_attempts_select_admin on public.bot_attempts
  for select to authenticated using ( public.velo_is_admin() );
revoke update, delete on public.bot_attempts from anon, authenticated;

create table if not exists public.data_requests (
  id             bigint generated always as identity primary key,
  email          text not null,
  report_summary text,
  sent_at        timestamptz not null default now(),
  sent_by        text
);
alter table public.data_requests enable row level security;
drop policy if exists data_requests_admin on public.data_requests;
create policy data_requests_admin on public.data_requests
  for all to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

create table if not exists public.deleted_accounts (
  id         bigint generated always as identity primary key,
  deleted_at timestamptz not null default now(),
  reason     text
);
alter table public.deleted_accounts enable row level security;
drop policy if exists deleted_accounts_admin on public.deleted_accounts;
create policy deleted_accounts_admin on public.deleted_accounts
  for select to authenticated using ( public.velo_is_admin() );
revoke insert, update, delete on public.deleted_accounts from anon, authenticated;
