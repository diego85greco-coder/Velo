-- Privacidad: email + push_subscription eran legibles por CUALQUIERA.
-- profiles_select (SELECT USING true, roles anon+authenticated) dejaba que
-- cualquier visitante hiciera `select email from profiles` y dumpeara los
-- correos y los endpoints push de TODOS los usuarios. RLS no puede ocultar
-- columnas (solo filas), así que se resuelve a nivel de GRANT de columnas.
--
-- IMPORTANTE: un REVOKE de columna NO tiene efecto si el rol conserva el SELECT
-- de tabla completa. Por eso se revoca el SELECT de tabla y se re-otorga SELECT
-- SOLO sobre las columnas seguras (todas menos email y push_subscription).
--
-- El dueño (backup de datos propios) y el admin (panel) sí necesitan email:
-- para eso se crea la vista `profiles_full` (SECURITY DEFINER: corre como su
-- dueño y por eso puede leer las columnas revocadas) gated por
-- `id = auth.uid() OR velo_is_admin()`. Un usuario común solo ve SU propia fila;
-- el admin ve todas; un anónimo no ve nada.

-- 1) SELECT por columna (sin email / push_subscription) para anon + authenticated.
revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;
grant select (
  id, nombre, avatar, motto, role, created_at,
  status_music, status_book, status_phrase, status_film,
  terms_accepted_at, plus_expires_at, helped_count, received_count,
  username, visit_day_count, user_status, incognito, read_bcast_ids,
  badge_notified, weather_city, visit_days, fav_contacts, blocked_users,
  dark_mode, username_changes, buddy_id, buddy_name, buddy_available_at,
  buddy_started_at, guardian_specialties, vibes_seen, onboarding_flags,
  achievements_json
) on public.profiles to anon, authenticated;

-- 2) Vista con la fila COMPLETA (incl. email/push) solo para dueño o admin.
create or replace view public.profiles_full as
  select * from public.profiles
  where id = auth.uid()::text or public.velo_is_admin();
grant select on public.profiles_full to authenticated;
