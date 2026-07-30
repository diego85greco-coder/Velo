-- ============================================================================
-- TOPE DE USO EN LOS PROXIES DE IA Y CORREO  (2026-07-30)  — APLICADA en prod
--
-- `ia_usage` ya llevaba la cuenta de 25 mensajes de IA por 24 h, pero la
-- insertaba EL CLIENTE. Quien llamara a /api/gemini directamente con su token
-- —que el navegador entrega— se saltaba la cuenta entera y podía quemar la clave
-- de Gemini en un bucle. Con /api/send-email pasaba lo mismo con Resend, y
-- encima usando el remitente noreply@heyvelo.app.
--
-- Ahora el tope lo consume el PROXY, no el cliente: antes de gastar la clave
-- llama a este RPC, que cuenta y registra en el mismo paso. No se puede saltear
-- porque quien decide es el servidor.
--
-- Tabla aparte de `ia_usage` a propósito: así el contador del proxy no interfiere
-- con la policy restrictiva que ya existe sobre ia_usage (que sigue de respaldo
-- para el insert del cliente). Nadie más que el RPC toca esta tabla.
--
-- Verificado en prod: el mensaje 26 de IA y el correo 11 devuelven
-- {"ok":false,"reason":"limit"}, y `select from velo_api_usage` como usuario
-- autenticado da "permission denied".
-- ============================================================================

create table if not exists public.velo_api_usage (
  id         bigint generated always as identity primary key,
  user_id    text not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists velo_api_usage_idx
  on public.velo_api_usage (user_id, kind, created_at desc);

alter table public.velo_api_usage enable row level security;
-- Sin policies: nadie llega por REST. Sólo entra por el RPC (security definer).
revoke all on public.velo_api_usage from anon, authenticated;

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
               when 'ia'    then 25   -- mismo cupo que ya mostraba la app
               when 'email' then 10   -- correos por persona y día
               else 25
             end;

  -- Velo Plus: la IA es ilimitada (el correo no, para que no sea un relay).
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
                              'limit', v_limit, 'used', v_used);
  end if;

  insert into public.velo_api_usage (user_id, kind) values (v_uid, p_kind);
  return jsonb_build_object('ok', true, 'remaining', v_limit - v_used - 1);
end;
$$;

revoke execute on function public.velo_consume_quota(text) from public;
revoke execute on function public.velo_consume_quota(text) from anon;
grant  execute on function public.velo_consume_quota(text) to authenticated;

-- Limpieza: para el tope sólo importan las últimas 24 h.
create or replace function public.velo_cleanup_api_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.velo_api_usage where created_at < now() - interval '48 hours';
$$;

select cron.unschedule('velo_cleanup_api_usage')
where exists (select 1 from cron.job where jobname = 'velo_cleanup_api_usage');

select cron.schedule('velo_cleanup_api_usage', '15 4 * * *',
  $$ select public.velo_cleanup_api_usage(); $$);
