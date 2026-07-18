-- ============================================================================
-- BROADCASTS: solo admin puede mandar a targets MASIVOS — 2026-07-18
--
-- La migración 20260717c ya bloquea la impersonación de "Administración". Pero un
-- no-admin que flipee el flag client-side velo_admin_session todavía podía insertar
-- un broadcast a un target MASIVO ('users'/'pros'/'all') con un sender comunitario
-- (spam / mensaje a toda la comunidad).
--
-- Esta política RESTRICTIVE agrega un gate (se combinan con AND, no habilita RLS
-- ni otorga acceso nuevo): a los targets masivos solo puede insertar un admin. Los
-- targets legítimos de usuarios comunes siguen abiertos:
--   'user:<id>'  (pedidos de chat, guardián, reviews, etc.)
--   'admin'      (tickets de soporte que los usuarios mandan a la administración)
-- ============================================================================

drop policy if exists "broadcasts_mass_admin_only" on public.broadcasts;
create policy "broadcasts_mass_admin_only"
  on public.broadcasts
  as restrictive
  for insert
  to public
  with check (
    coalesce(target, '') not in ('users', 'pros', 'all')
    or public.velo_is_admin()
  );
