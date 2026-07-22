-- ============================================================================
-- DM PUSH TRIGGER — 2026-07-22
--
-- Dispara la Edge Function `send-dm-push` cada vez que entra un DM nuevo en
-- direct_messages, del lado SERVIDOR. Asi el push llega aunque el que escribe
-- tenga una version vieja de la app (no depende del trigger del cliente).
--
-- Usa supabase_functions.http_request (el mismo mecanismo que los Database
-- Webhooks de la UI de Supabase). La Authorization lleva la anon key (publica,
-- no secreta) porque el gateway de Functions exige un auth header.
--
-- Idempotente: dropea el trigger si ya existe y lo recrea limpio.
-- ============================================================================

drop trigger if exists dm_push_notify on public.direct_messages;

create trigger dm_push_notify
  after insert on public.direct_messages
  for each row
  execute function supabase_functions.http_request(
    'https://yuravtnjvvztsxdtggod.supabase.co/functions/v1/send-dm-push',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C"}',
    '{}',
    '5000'
  );
