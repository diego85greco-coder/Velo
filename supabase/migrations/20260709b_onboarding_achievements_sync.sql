-- v1372: sincronizar cross-device los flags de onboarding/tour + logros.
-- Antes vivían SOLO en localStorage — en cualquier dispositivo/navegador
-- nuevo (o tras reinstalar la PWA) volvían a dispararse aunque el usuario
-- ya los hubiera completado/desbloqueado en otro dispositivo.
--
-- achievements_json ya existía (se usaba solo de escritura); esta migración
-- solo confirma su existencia por si el entorno no la tiene. onboarding_flags
-- es nueva: { home_onboarding_done: true, tour_done: "v1235" }

begin;

alter table public.profiles
  add column if not exists onboarding_flags jsonb default '{}'::jsonb;

alter table public.profiles
  add column if not exists achievements_json text default '{}';

commit;
