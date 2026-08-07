-- ============================================================================
-- SEPARAR EL CUPO DE CONVERSACIÓN DEL DE LAS LLAMADAS DEL SISTEMA (30/07) — APLICADA
--
-- REGRESIÓN INTRODUCIDA EN v1621. Al mover el tope de IA al servidor, quedó
-- contando TODAS las llamadas a Gemini contra los mismos 25 diarios del usuario.
-- Pero la mayoría no las hace la persona: las hace la app.
--   * moderación automática de CADA publicación (_geminiModerateContent)
--   * detector de crisis por IA (_geminiCrisisCheck)
--   * resúmenes semanal, mensual y anual
--   * frase del día, sugerencias, traducciones
--
-- Consecuencia: alguien que publicaba 25 veces se quedaba sin poder hablar con
-- el acompañante, sin haberlo usado nunca. Y —más grave— el clasificador de
-- crisis por IA dejaba de ejecutarse al agotarse el cupo. (La detección local
-- por palabras y el directorio SOS no dependen de Gemini y seguían andando, así
-- que la red de seguridad no llegó a caerse del todo.)
--
-- Ahora son dos cupos:
--   'ia'     → 25/día  · conversación con el acompañante. Ilimitado con Plus.
--   'ia_sys' → 200/día · llamadas que hace la app sola. Techo generoso para un
--              uso intenso real, pero acotado: sigue frenando un bucle.
--
-- Verificado en prod: con los 25 de conversación agotados, 'ia_sys' sigue
-- pasando (quedan 199) y corta en el 201.
-- ============================================================================

create or replace function public.velo_consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   text := auth.uid()::text;
  v_limit int;
  v_used  int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;

  v_limit := case p_kind
               when 'ia'     then 25    -- conversación con el acompañante
               when 'ia_sys' then 200   -- moderación, crisis, resúmenes, frases
               when 'email'  then 10
               else 25
             end;

  -- Velo Plus: la conversación es ilimitada. El resto conserva su techo:
  -- 'ia_sys' y 'email' existen para acotar el gasto y el abuso, no para vender.
  if p_kind = 'ia' and public.velo_is_premium(v_uid) then
    insert into public.velo_api_usage (user_id, kind) values (v_uid, p_kind);
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  select count(*) into v_used
    from public.velo_api_usage u
   where u.user_id = v_uid
     and u.kind = p_kind
     and u.created_at > now() - interval '24 hours';

  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'limit',
                              'limit', v_limit, 'used', v_used, 'kind', p_kind);
  end if;

  insert into public.velo_api_usage (user_id, kind) values (v_uid, p_kind);
  return jsonb_build_object('ok', true, 'remaining', v_limit - v_used - 1, 'kind', p_kind);
end;
$$;

revoke execute on function public.velo_consume_quota(text) from public;
revoke execute on function public.velo_consume_quota(text) from anon;
grant  execute on function public.velo_consume_quota(text) to authenticated;
