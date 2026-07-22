-- ============================================================================
-- DM PUSH TRIGGER (pg_net) — 2026-07-22
--
-- Dispara la Edge Function `send-dm-push` cada vez que entra un DM nuevo en
-- direct_messages, del lado SERVIDOR. Asi el push llega aunque el que escribe
-- tenga una version vieja de la app (no depende del trigger del cliente).
--
-- Usa pg_net (net.http_post) directamente en vez de supabase_functions.http_request,
-- porque pg_net esta disponible en TODOS los proyectos de Supabase, mientras que
-- el esquema supabase_functions solo existe si alguna vez se configuraron Database
-- Webhooks desde la UI. Asi funciona al primer intento sin importar la config.
--
-- La Authorization lleva la anon key (publica, no secreta) porque el gateway de
-- Functions exige un auth header. Idempotente: recrea funcion y trigger limpios.
-- ============================================================================

create extension if not exists pg_net;

create or replace function public.dm_push_notify_fn()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://yuravtnjvvztsxdtggod.supabase.co/functions/v1/send-dm-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C'
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'direct_messages',
      'schema', 'public',
      'record', to_jsonb(new)
    )
  );
  return new;
end;
$$;

drop trigger if exists dm_push_notify on public.direct_messages;

create trigger dm_push_notify
  after insert on public.direct_messages
  for each row
  execute function public.dm_push_notify_fn();
