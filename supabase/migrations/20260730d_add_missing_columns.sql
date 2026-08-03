-- ============================================================================
-- COLUMNAS QUE EL CÓDIGO ESCRIBE Y NO EXISTÍAN  (2026-07-30) — APLICADA en prod
--
-- Encontradas cruzando cada insert/update/upsert de premium.js contra el esquema
-- real de la base. Cuando una columna no existe, PostgREST rechaza la operación
-- ENTERA: no se guarda incompleto, no se guarda nada. Y como casi todas estas
-- llamadas están dentro de un try/catch silencioso, la app decía que sí y no
-- pasaba nada. Por eso ninguno de estos fallos se notaba.
--
-- Lo que estaba roto de verdad:
--   * `contacts` — el FORMULARIO DE CONTACTO no guardaba nada. Faltaban
--     user_name, user_id y source. La tabla tenía 0 filas: nunca funcionó.
--   * `reviews` — responder una reseña siempre daba "Error al guardar".
--   * `moderation_flags` — moderación no podía cerrar un reporte ("Error al
--     moderar"). Faltaban resolved_by y resolved_at.
--   * `content_reports` — reportar una respuesta de la Pregunta del Día fallaba
--     al insertar (faltaba `resolved`), y resolverla también.
--   * `reportes` — resolver un reporte fallaba (faltaba resolved_at).
--   * `diary_entries` — la rama que guarda el diario con título fallaba y caía
--     a la cola de reintentos.
--   * `terms_acceptance` — la constancia no se guardaba (faltaban rol, version,
--     ip_hint). La prueba principal sigue estando en profiles
--     (terms_accepted_at / terms_version / age_confirmed_at), que sí funciona.
--   * `profiles.daily_quote_cache` — se LEE en premium.js:6286 pero no existía,
--     así que la caché de la frase del día nunca guardaba.
--   * `direct_messages.read_at` — funcionaba sólo gracias a un reintento sin esa
--     columna; ahora no hace falta el segundo viaje.
--
-- Se arregló además en el cliente (v1622): el último paso del borrado de cuenta
-- escribía `bio` en profiles, que no existe, así que el update fallaba entero.
-- Si el RPC del servidor no había corrido, el perfil quedaba intacto con el
-- nombre y el avatar de la persona. Ahí la columna sobraba: se quitó del
-- cliente en vez de añadirla.
--
-- NO se añaden (módulo de profesionales, retirado): plus_grants.note y
-- profiles.pro_spec / pro_trial_expires_at / pro_cert_url / pro_verified /
-- pro_availability / pro_solidarity / pro_subscription_expires_at /
-- dpa_accepted_at.
--
-- Verificado en prod: las 9 operaciones que fallaban ahora pasan.
-- Idempotente.
-- ============================================================================

alter table public.contacts
  add column if not exists user_name text,
  add column if not exists user_id   text,
  add column if not exists source    text;

alter table public.terms_acceptance
  add column if not exists rol     text,
  add column if not exists version text,
  add column if not exists ip_hint text;

alter table public.reviews
  add column if not exists reply      text,
  add column if not exists reply_name text;

alter table public.profiles
  add column if not exists daily_quote_cache text;

alter table public.content_reports
  add column if not exists resolved    boolean not null default false,
  add column if not exists resolved_at timestamptz;

alter table public.direct_messages
  add column if not exists read_at timestamptz;

alter table public.reportes
  add column if not exists resolved_at timestamptz;

alter table public.moderation_flags
  add column if not exists resolved_by text,
  add column if not exists resolved_at timestamptz;

alter table public.diary_entries
  add column if not exists title text;
