-- Privacidad Pregunta del día: las respuestas anónimas (user_name='Anónimo')
-- se guardan SIEMPRE con el user_id real (necesario por el onConflict del upsert
-- y para detectar "es mía"). Pero el feed leía `select('*')` de daily_responses,
-- así que el user_id real de un anónimo VIAJABA en la respuesta de red. Peor aún:
-- como user_id venía presente, la UI permitía tocar el avatar del "Anónimo" y
-- abrir su PERFIL REAL (pQuickProfile con el user_id) → desanonimización total.
--
-- Fix: una vista `daily_responses_feed` que enmascara user_id → NULL cuando la
-- fila es anónima y quien consulta NO es su autor. El autor sí ve su propio
-- user_id (para "Tu respuesta"). Las filas NO anónimas conservan user_id
-- (para @handle y bloqueo). security_invoker = on: la vista respeta la RLS de
-- la tabla base y auth.uid() refleja al usuario que consulta.

create or replace view public.daily_responses_feed
with (security_invoker = on) as
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
