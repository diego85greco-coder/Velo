-- v1368: estado de "vistos" de Vibes sincronizado entre dispositivos.
-- Columna JSONB en profiles: { "instant": { "<vibeId>": ts, ... },
--                              "groups": { "<groupId>": ts, ... } }
-- El cliente la mergea con su localStorage al abrir Vibes y la actualiza
-- al marcar momentos como vistos. Entradas viejas (>48h) se podan en cliente.

begin;

alter table public.profiles
  add column if not exists vibes_seen jsonb default '{}'::jsonb;

commit;
