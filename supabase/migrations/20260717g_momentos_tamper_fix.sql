-- ============================================================================
-- MOMENTOS TAMPER FIX — 2026-07-17
-- momentos.update_hearts era UPDATE USING true SIN restriccion de columnas:
-- cualquiera podia sobrescribir texto/autor/cualquier campo de cualquier momento.
--
-- Fix: los corazones pasan por un RPC atomico SECURITY DEFINER, y el cliente
-- solo conserva privilegio de UPDATE sobre la columna `hearts` (column-level
-- grant). El muro sigue siendo de lectura publica (es su diseno), pero ya no
-- se puede alterar el contenido ajeno.
-- ============================================================================

-- RPC atomico de corazones (no depende de RLS)
create or replace function public.increment_momento_hearts(post_id text)
returns void language sql security definer set search_path = public as $$
  update public.momentos set hearts = coalesce(hearts,0) + 1 where id = post_id;
$$;
revoke all on function public.increment_momento_hearts(text) from public;
grant execute on function public.increment_momento_hearts(text) to anon, authenticated;

-- Cerrar el UPDATE libre: solo la columna hearts es editable desde el cliente
drop policy if exists "update_hearts" on public.momentos;
create policy "momentos_update_hearts_only" on public.momentos
  for update using (true) with check (true);
revoke update on public.momentos from anon, authenticated;
grant update (hearts) on public.momentos to anon, authenticated;

-- ============================================================================
-- Pendiente (necesita nombres exactos de policies + test del muro publico):
--   * momento_comments: user_id se guarda siempre -> enmascarar via vista
--   * dq_comments:      idem
--   * momentos user_hash linkability: cambio de modelo de anonimato (client-side)
-- ============================================================================
