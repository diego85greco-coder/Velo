-- ============================================================================
-- CONSTANCIA DE CONSENTIMIENTO  (2026-07-24)
--
-- El RGPD exige poder DEMOSTRAR el consentimiento (art. 7.1), no sólo obtenerlo.
-- Hasta ahora se guardaba `terms_accepted_at` (cuándo) pero no QUÉ VERSIÓN de los
-- textos se aceptó, así que al cambiar los Términos no había forma de saber quién
-- aceptó cuál ni a quién pedirle una nueva aceptación.
--
-- Además, los Términos exigen 16 años (edad mínima de consentimiento digital en
-- Portugal, Ley 58/2019) pero el registro no lo comprobaba ni dejaba constancia.
--
-- Idempotente.
-- ============================================================================

alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

comment on column public.profiles.terms_version is
  'Versión de Términos/Privacidad aceptada por el usuario (VELO_TERMS_VERSION en premium.js). Permite exigir re-aceptación al publicar una versión nueva.';
comment on column public.profiles.age_confirmed_at is
  'Momento en que la persona declaró tener 16 años o más durante el registro.';
