-- ============================================================================
-- DAILY_RESPONSES — cerrar la desanonimización de respuestas "Anónimo"  (2026-07-23)
--
-- Problema: la tabla cruda public.daily_responses era legible por cualquiera con
-- la anon key, y guarda el user_id REAL incluso en las respuestas anónimas
-- (necesario por el onConflict del upsert). Así, aunque el feed use la vista
-- enmascarada daily_responses_feed, un atacante podía leer la tabla cruda
-- directamente y linkear cada "Anónimo" a su cuenta real → desanonimización total.
--
-- Fix: la tabla cruda pasa a ser OWNER-ONLY vía RLS (cada quien lee/edita sólo
-- sus propias filas). El feed comunitario va SIEMPRE por la vista, que ahora es
-- SECURITY DEFINER: devuelve todas las respuestas del día pero con user_id
-- enmascarado a NULL en las anónimas ajenas.
--
-- Impacto en la app (ya contemplado en el cliente, v1590):
--   • El feed se lee de daily_responses_feed (línea _fetchDailyFeed).
--   • El conteo "N respondieron hoy" y el teaser se leen de la vista.
--   • El realtime sobre la tabla cruda sólo entregará las filas propias; el feed
--     igual se refresca con el poll de 15s (fallback ya existente) → los aportes
--     de otros aparecen en <=15s en vez de instantáneo. Degradación mínima.
--   • Upsert/updates/deletes del propio usuario siguen funcionando (owner-only).
--
-- Idempotente: se puede reaplicar sin efectos secundarios.
-- ============================================================================

alter table public.daily_responses enable row level security;

drop policy if exists dr_select_own on public.daily_responses;
create policy dr_select_own on public.daily_responses
  for select using (user_id = auth.uid());

drop policy if exists dr_insert_own on public.daily_responses;
create policy dr_insert_own on public.daily_responses
  for insert with check (user_id = auth.uid());

drop policy if exists dr_update_own on public.daily_responses;
create policy dr_update_own on public.daily_responses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists dr_delete_own on public.daily_responses;
create policy dr_delete_own on public.daily_responses
  for delete using (user_id = auth.uid());

-- La lectura directa de la tabla cruda ya no está permitida para roles públicos
-- (authenticated queda gobernado por las policies owner-only de arriba; anon no
-- necesita leer la tabla cruda — usa la vista).
revoke select on public.daily_responses from anon;

-- Vista del feed: SECURITY DEFINER (security_invoker = off) para devolver TODAS
-- las respuestas del día, con user_id enmascarado en las anónimas ajenas. El
-- guard auth.uid() sigue reflejando a quien consulta (lee request.jwt.claims,
-- independiente de definer/invoker).
drop view if exists public.daily_responses_feed;
create view public.daily_responses_feed
with (security_invoker = off) as
  select
    dr.id,
    case
      when dr.user_name = 'Anónimo' and dr.user_id is distinct from auth.uid()
      then null
      else dr.user_id
    end as user_id,
    dr.question_date,
    dr.question_id,
    dr.mood_emoji,
    dr.response_text,
    dr.user_name,
    dr.user_avatar,
    dr.created_at
  from public.daily_responses dr;

grant select on public.daily_responses_feed to anon, authenticated;
