-- ============================================================================
-- ÚLTIMAS LLAMADAS QUE FALLABAN EN SILENCIO (07/08/2026) — APLICADA
--
-- Quedaban del módulo de profesionales, retirado y ya inalcanzable (en v1623 se
-- le quitó el acceso por enlace directo). Sus llamadas seguían ahí, fallando
-- calladas porque las columnas no existen.
--
-- Con el registro de errores de v1627 desplegado, esas llamadas empezarían a
-- ensuciar la consola con `[velo-db]` en cada arranque de quien tenga rol
-- 'pro'. Ruido que despistaría a quien retome el proyecto: parecen bugs activos
-- y no lo son.
--
-- Se añaden las columnas en vez de borrar el código: es reversible, no toca
-- nada vivo, y si algún día se reactiva la sección, funciona. Todas admiten
-- NULL y no tienen valor por defecto — no cambian ninguna fila existente.
--
-- `solidarity_requests` y `pro_patient_notes` NO se crean: son formularios de
-- esa misma sección. Crear tablas para código muerto sería dejar más superficie
-- sin motivo. Si se reactivara, hay que crearlas entonces.
-- ============================================================================

alter table public.profiles
  add column if not exists pro_spec                    text,
  add column if not exists pro_trial_expires_at        timestamptz,
  add column if not exists pro_subscription_expires_at timestamptz,
  add column if not exists pro_cert_url                text,
  add column if not exists pro_verified                boolean,
  add column if not exists pro_availability            text,
  add column if not exists pro_solidarity              boolean,
  add column if not exists dpa_accepted_at             timestamptz;

alter table public.plus_grants
  add column if not exists note text;
