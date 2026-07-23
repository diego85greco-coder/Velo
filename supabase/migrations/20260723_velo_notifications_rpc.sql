-- ============================================================================
-- VELO_NOTIFICATIONS — cerrar el INSERT abierto (spoofing de notifs) (2026-07-23)
-- APLICADA en prod vía MCP (migrations: velo_notifications_insert_via_rpc +
-- velo_create_notif_revoke_anon).
--
-- Antes: la policy insert_all (WITH CHECK true) dejaba insertar filas con
-- user_id/contenido arbitrarios → notificaciones falsas que parecían del sistema.
-- Ahora: insert directo revocado; se crea vía RPC security-definer que exige auth,
-- no permite auto-notificarse, registra el remitente real (sender_id) y sanea
-- campos. El service_role sigue insertando notifs del sistema (bypassa RLS/grants).
--
-- El cliente (v1590+) llama al RPC y cae al insert directo sólo si el RPC aún no
-- existe (rollout sin cortes).
-- ============================================================================

alter table public.velo_notifications add column if not exists sender_id uuid;

create or replace function public.velo_create_notif(
  p_recipient uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_related text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;                             -- sólo autenticados
  if p_recipient is null or p_recipient = auth.uid() then return; end if; -- no self / no nulo
  insert into public.velo_notifications
    (user_id, sender_id, type, title, body, related_id, is_read, created_at)
  values (
    p_recipient,
    auth.uid(),
    left(coalesce(p_type, ''), 40),
    left(coalesce(p_title, ''), 200),
    nullif(left(coalesce(p_body, ''), 500), ''),
    nullif(left(coalesce(p_related, ''), 100), ''),
    false,
    now()
  );
end;
$$;

-- Sólo authenticated puede ejecutar el RPC (se revoca el EXECUTE por defecto de
-- public/anon; igual el cuerpo hace return si auth.uid() es null).
revoke execute on function public.velo_create_notif(uuid, text, text, text, text) from public;
revoke execute on function public.velo_create_notif(uuid, text, text, text, text) from anon;
grant  execute on function public.velo_create_notif(uuid, text, text, text, text) to authenticated;

-- Quitar el insert directo (vector de spoofing)
drop policy if exists insert_all on public.velo_notifications;
revoke insert on public.velo_notifications from anon, authenticated;
