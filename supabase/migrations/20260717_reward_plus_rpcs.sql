-- Premios de Velo Plus (Diamante 100 conv · 5 referidos válidos) server-side.
-- Antes se otorgaban desde el cliente escribiendo role='plus' / plus_expires_at:
--   • Diamante: lo bloqueaba el trigger velo_protect_role (y escribía una columna
--     inexistente), así que NUNCA se activaba.
--   • Referidos: el cliente intentaba editar el perfil del REFERRER (otra fila),
--     que la RLS profiles_update_own bloquea → tampoco funcionaba.
-- Ambos además confiaban en contadores del cliente (inseguro).
--
-- Solución: RPCs SECURITY DEFINER que VALIDAN contra datos reales del servidor y
-- otorgan por una vía autorizada. El trigger velo_protect_role se amplía para
-- permitir el cambio de role SOLO cuando un GUC de sesión (velo.reward_grant)
-- está en 'on', y ese GUC lo setea únicamente estos RPC tras validar. Un cliente
-- no puede setear GUCs vía PostgREST, así que no hay forma de auto-otorgarse Plus.

-- Guard de doble-otorgo del premio Diamante.
alter table public.profiles add column if not exists diamante_plus_granted_at timestamptz;

-- Trigger: permitir cambio de role si lo hace el service_role, un admin, o un
-- RPC de premio validado (GUC velo.reward_grant = 'on').
create or replace function public.velo_protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is null then
      return new;                                  -- service_role (webhook de pago)
    end if;
    if coalesce(auth.jwt() ->> 'email', '') in
       ('consultas@heyvelo.app', 'wearevelo.app@gmail.com') then
      return new;                                  -- admin (activa/cancela manual)
    end if;
    if coalesce(current_setting('velo.reward_grant', true), '') = 'on' then
      return new;                                  -- premio validado server-side
    end if;
    new.role := old.role;                          -- cualquier otro → revertir
  end if;
  return new;
end;
$$;

-- ── PREMIO DIAMANTE: 90 días de Plus al llegar a 100 conversaciones reales ──
create or replace function public.grant_diamante_plus()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_helped  int;
  v_already timestamptz;
  v_base    timestamptz;
  v_new_exp timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;

  select diamante_plus_granted_at into v_already from public.profiles where id = v_uid;
  if v_already is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_granted');
  end if;

  -- Conteo REAL de conversaciones como guardián (no la columna helped_count,
  -- que el cliente puede escribir). Mismo criterio que get_user_session_counts.
  select count(*) into v_helped from public.guardian_requests
    where guardian_id = v_uid and status in ('ended', 'message_left');
  if v_helped < 100 then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible', 'helped', v_helped);
  end if;

  select greatest(now(), coalesce(plus_expires_at, now())) into v_base
    from public.profiles where id = v_uid;
  v_new_exp := v_base + interval '90 days';

  perform set_config('velo.reward_grant', 'on', true);
  update public.profiles
    set role = 'plus', plus_expires_at = v_new_exp, diamante_plus_granted_at = now()
    where id = v_uid;
  perform set_config('velo.reward_grant', 'off', true);

  return jsonb_build_object('ok', true, 'expires_at', v_new_exp, 'helped', v_helped);
end;
$$;
revoke all on function public.grant_diamante_plus() from public, anon;
grant execute on function public.grant_diamante_plus() to authenticated;

-- ── PREMIO REFERIDOS: 30 días de Plus al referrer por cada 5 invitados válidos ──
-- Lo llama el usuario INVITADO. Valida que él mismo usó la app ≥3 días (date_key
-- distintos en mood_entries) antes de marcar su calificación; si el referrer
-- junta 5 calificados sin premiar, se le otorga Plus por la vía definer.
create or replace function public.claim_referral_qualification()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_ref     public.referrals%rowtype;
  v_days    int;
  v_pending int;
  v_rounds  int;
  v_base    timestamptz;
  v_new_exp timestamptz;
  v_ids     uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;

  select * into v_ref from public.referrals where referred_id = v_uid limit 1;
  if v_ref.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_referral');
  end if;
  if v_ref.qualified_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_qualified');
  end if;

  select count(distinct date_key) into v_days
    from public.mood_entries where user_id::text = v_uid;
  if v_days < 3 then
    return jsonb_build_object('ok', false, 'reason', 'not_qualified', 'days', v_days);
  end if;

  update public.referrals set qualified_at = now() where id = v_ref.id;

  select count(*) into v_pending from public.referrals
    where referrer_id = v_ref.referrer_id
      and qualified_at is not null and reward_granted_at is null;

  if v_pending >= 5 then
    v_rounds := v_pending / 5;
    select greatest(now(), coalesce(plus_expires_at, now())) into v_base
      from public.profiles where id = v_ref.referrer_id;
    v_new_exp := v_base + (v_rounds * interval '30 days');

    perform set_config('velo.reward_grant', 'on', true);
    update public.profiles
      set role = 'plus', plus_expires_at = v_new_exp
      where id = v_ref.referrer_id;
    perform set_config('velo.reward_grant', 'off', true);

    select array_agg(id) into v_ids from (
      select id from public.referrals
      where referrer_id = v_ref.referrer_id
        and qualified_at is not null and reward_granted_at is null
      order by qualified_at asc
      limit (v_rounds * 5)
    ) s;
    update public.referrals set reward_granted_at = now() where id = any(v_ids);

    -- Aviso al referrer: ganó Plus.
    insert into public.broadcasts (target, subject, body, icon, sender)
    values ('user:' || v_ref.referrer_id, '🎉 ¡Ganaste Velo Plus!',
            '¡Ganaste ' || (v_rounds * 30) || ' días de Velo Plus! Ya se activó en tu cuenta 🎉 '
            || 'Gracias por invitar a la comunidad 💚',
            '🎉', 'Velo — Comunidad');

    return jsonb_build_object('ok', true, 'rewarded_referrer', true,
                              'referrer', v_ref.referrer_id, 'expires_at', v_new_exp,
                              'rounds', v_rounds);
  end if;

  -- Aviso de progreso al referrer.
  insert into public.broadcasts (target, subject, body, icon, sender)
  values ('user:' || v_ref.referrer_id, '✨ Otra invitación válida',
          'Alguien que invitaste ya usó Velo 3 días. Llevás ' || v_pending
          || '/5 invitaciones válidas — te faltan ' || (5 - (v_pending % 5))
          || ' para ganar +30 días de Plus 💚',
          '💚', 'Velo — Comunidad');

  return jsonb_build_object('ok', true, 'rewarded_referrer', false, 'pending', v_pending);
end;
$$;
revoke all on function public.claim_referral_qualification() from public, anon;
grant execute on function public.claim_referral_qualification() to authenticated;
