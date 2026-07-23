-- ============================================================================
-- DAILY_RESPONSES — cerrar la des-anonimización de respuestas "Anónimo" (2026-07-23)
-- APLICADA en prod vía MCP (migration: daily_responses_owner_only_read).
--
-- Antes: la policy public_read_daily (SELECT using true) dejaba leer la tabla
-- cruda a cualquiera, exponiendo el user_id real de las respuestas anónimas
-- (des-anonimización). Ahora: lectura directa OWNER-ONLY; el feed comunitario va
-- por la vista security-definer daily_responses_feed, que enmascara user_id a NULL
-- en las anónimas ajenas. Las policies de insert/update/delete ya eran owner-only.
-- ============================================================================

-- 1) Quitar la lectura pública de la tabla cruda
drop policy if exists public_read_daily on public.daily_responses;

-- 2) SELECT owner-only directo sobre la tabla
drop policy if exists dr_select_own on public.daily_responses;
create policy dr_select_own on public.daily_responses
  for select using (auth.uid() = user_id);

-- 3) Vista del feed → SECURITY DEFINER: devuelve TODAS las respuestas del día con
--    user_id enmascarado a NULL en las anónimas ajenas. auth.uid() sigue
--    reflejando a quien consulta (request.jwt.claims), no depende del definer.
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
