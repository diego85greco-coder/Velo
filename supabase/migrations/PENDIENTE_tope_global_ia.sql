-- ============================================================================
-- ⚠️ PREPARADA Y PROBADA, **NO APLICADA** (conector de Supabase caído el 11/08).
--
-- EL CLIENTE ELIGE CONTRA QUÉ CUPO SE LE COBRA  (detectado 11/08/2026)
--
-- `api/gemini.js` decide el cupo así:
--
--     const _kind = (req.body && req.body.kind === 'ia_sys') ? 'ia_sys' : 'ia';
--
-- Es decir: lo manda el cliente. Cualquier persona con cuenta puede poner
-- `kind: 'ia_sys'` en cada mensaje del acompañante y usar el techo de 200/día
-- en vez del de 25/día. Ocho veces más llamadas a Gemini por persona.
--
-- POR QUÉ IMPORTA MÁS DE LO QUE PARECE: el crédito de Gemini es de prepago y
-- queda poco. Cuando se agota no falla sólo el acompañante — dejan de correr la
-- moderación, los resúmenes y **el clasificador de crisis**, sin ningún aviso.
-- Ya pasó una vez, por otro motivo, y así se descubrió (v1621 → v1625).
--
-- POR QUÉ NO SE ARREGLA EN EL SERVIDOR: el servidor no tiene forma honesta de
-- saber si una llamada es del acompañante o de la moderación; el cliente
-- controla todo lo que manda. Cerrar la puerta desde `api/gemini.js` sería
-- adivinar por la forma del prompt, que se rompe al primer cambio.
--
-- QUÉ HACE ESTO: deja los dos cupos como están y añade un TECHO GLOBAL por
-- persona y día sobre la suma de ambos. No cambia el uso normal —una persona
-- activa gasta del orden de 30-50 llamadas automáticas al día— pero pone un
-- suelo duro a cuánto puede quemar una sola cuenta, diga lo que diga.
--
-- 150 es un número elegido para no molestar a nadie real. Si alguna vez topa a
-- alguien legítimo, se sube; no se baja sin mirar `velo_api_usage` antes:
--
--   select user_id, count(*) from velo_api_usage
--    where created_at > now() - interval '24 hours' and kind in ('ia','ia_sys')
--    group by user_id order by 2 desc;
--
-- PROBADA en un PostgreSQL 16 local con la tabla replicada:
--   * 25 llamadas 'ia' → la 26ª se rechaza (cupo por tipo, igual que hoy)
--   * quien miente y manda 'ia_sys' para conversar queda cortado en 150
--   * con Velo Plus, la conversación 401 sigue pasando (ilimitada de verdad)
--     y ADEMÁS le quedan las 200 automáticas: no se queda sin moderación ni
--     sin detector de crisis por haber hablado mucho
--   * 'email' no cuenta para el techo (no gasta crédito de Gemini)
--
-- El primer intento de esta migración SÍ cortaba a quien tuviera Plus al llegar
-- a 150. Se corrigió al verlo en la prueba: en esta aplicación, quien más habla
-- con el acompañante suele ser quien peor lo está pasando, y dejarle sin
-- detector de crisis por hablar mucho es exactamente lo contrario de lo que hay
-- que hacer. Por eso las conversaciones con Plus se registran como 'ia_plus' y
-- quedan fuera del recuento.
-- ============================================================================

create or replace function public.velo_consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_limit  int;
  v_used   int;
  v_global int;
  c_global constant int := 150;   -- techo diario por persona sobre ia + ia_sys
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

  -- Velo Plus: la conversación es ilimitada y NO cuenta para el techo global.
  -- Se registra como 'ia_plus' justamente para eso. Si contara, una persona con
  -- Plus que hablara mucho —que en esta aplicación suele ser alguien que lo está
  -- pasando mal— se quedaría además sin moderación ni detector de crisis.
  -- El techo existe para acotar el abuso de quien no paga, no para cortar a
  -- quien sí lo hace.
  if p_kind = 'ia' and public.velo_is_premium(v_uid) then
    insert into public.velo_api_usage (user_id, kind) values (v_uid, 'ia_plus');
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  -- Techo global sobre lo que sí puede inflarse mintiendo en `kind`.
  if p_kind in ('ia', 'ia_sys') then
    select count(*) into v_global
      from public.velo_api_usage u
     where u.user_id = v_uid
       and u.kind in ('ia', 'ia_sys')
       and u.created_at > now() - interval '24 hours';
    if v_global >= c_global then
      return jsonb_build_object('ok', false, 'reason', 'global',
                                'limit', c_global, 'used', v_global, 'kind', p_kind);
    end if;
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
