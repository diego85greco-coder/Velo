-- ============================================================================
-- VELO_NOTIFICATIONS — cerrar el INSERT abierto (spoofing/spam de notifs)  (2026-07-23)
--
-- Problema: la política de INSERT estaba abierta ("insert_all") porque las
-- notificaciones in-app se crean para OTRO usuario (cuando comentás/reaccionás
-- a su contenido), y una RLS owner-only rompería esa mecánica. Pero abierto así,
-- cualquiera podía insertar filas con user_id y contenido arbitrarios → entregar
-- notificaciones falsas que parecen del sistema.
--
-- Fix: se revoca el INSERT directo para roles públicos y se crea un RPC
-- security-definer velo_create_notif() que:
--   • exige usuario autenticado (auth.uid() no nulo),
--   • no permite auto-notificarse,
--   • registra el remitente REAL (sender_id = auth.uid()) → trazabilidad/moderación,
--   • sanea/acorta los campos.
-- Esto no elimina del todo el spam entre usuarios autenticados, pero lo hace
-- atribuible (sender_id) y elimina el insert anónimo/forjado de user_id arbitrario.
-- El service_role (notifs del sistema) sigue insertando porque bypassa RLS/grants.
--
-- El cliente (v1590) llama al RPC y cae al insert directo sólo si el RPC aún no
-- está desplegado, así el rollout es sin cortes.
--
-- Idempotente.
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
  if auth.uid() is null then return; end if;              -- sólo autenticados
  if p_recipient is null or p_recipient = auth.uid() then return; end if;  -- no self / no nulo
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

grant execute on function public.velo_create_notif(uuid, text, text, text, text) to authenticated;

-- Quitar el insert directo (era el vector de spoofing). service_role no se ve
-- afectado (bypassa RLS/grants) → las notifs del sistema siguen funcionando.
revoke insert on public.velo_notifications from anon, authenticated;
