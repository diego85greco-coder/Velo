-- ============================================================================
-- bitacora_reports: dejar de exponer QUIÉN reportó a QUIÉN  (2026-07-30)
-- APLICADA en prod.
--
-- `bt_rp_select USING(true)` permitía a cualquier usuario leer la tabla entera:
-- el reportante (user_id) junto al post reportado. En una comunidad chica eso
-- es material para represalias, y es el mismo hueco que ya se cerró en
-- moderation_flags (24/07) y reportes (30/07).
--
-- Hay UNA lectura legítima de todo el mundo (premium.js): el cliente pide los
-- post_id reportados para ocultarlos del feed mientras moderación decide. Sólo
-- necesita el post_id, no quién reportó. Se le da una vista con esa única
-- columna y la tabla cruda pasa a ser de moderación.
--
-- Verificado: usuario normal ve 0 filas en bitacora_reports y 1 en la vista.
-- ============================================================================

create or replace view public.bitacora_reported_ids as
  select distinct post_id from public.bitacora_reports where post_id is not null;

grant select on public.bitacora_reported_ids to anon, authenticated;

drop policy if exists bt_rp_select on public.bitacora_reports;
create policy bt_rp_select on public.bitacora_reports
  for select to authenticated using ( public.velo_is_admin() );

drop policy if exists bt_rp_insert on public.bitacora_reports;
create policy bt_rp_insert on public.bitacora_reports
  for insert to authenticated with check (true);

drop policy if exists bt_rp_delete on public.bitacora_reports;
create policy bt_rp_delete on public.bitacora_reports
  for delete to authenticated using ( public.velo_is_admin() );
