-- ============================================================================
-- CIERRE DE LA DE-ANONIMIZACIÓN — Sala de Ayuda, Muro y Bitácora  (2026-07-29)
--
-- QUÉ ESTABA MAL
-- Las tres tablas guardan el user_id real del autor incluso cuando la persona
-- publicó como ANÓNIMA. Las migraciones del 17 y 18/07 crearon vistas que
-- enmascaran ese user_id (help_posts_feed, happy_posts_full, bitacora_posts_full)
-- y revocaron el SELECT del crudo al rol `anon`… pero DEJARON el SELECT del crudo
-- al rol `authenticated`, porque el websocket de Realtime lo necesitaba.
--
-- Consecuencia: cualquier persona con una cuenta (la app entrega su JWT al
-- navegador) podía saltarse la vista y pedir la tabla directamente:
--
--   GET /rest/v1/bitacora_posts?select=id,user_id,titulo
--   GET /rest/v1/help_posts?select=user_id,preview
--
-- y obtener el autor de cada publicación anónima. Cruzándolo con `profiles`
-- (nombre, @usuario) quedaba identificada la persona. En Sala de Ayuda eso
-- significa poder ligar a alguien con nombre y apellido a lo que escribió
-- pidiendo ayuda: es el peor riesgo de privacidad que quedaba abierto y el que
-- la app promete explícitamente que no ocurre al ofrecer publicar "en anónimo".
--
-- QUÉ HACE ESTA MIGRACIÓN
-- El SELECT de la tabla cruda pasa a ser: publicaciones NO anónimas, las propias,
-- o moderación (velo_is_admin). Las publicaciones anónimas ajenas dejan de ser
-- legibles en el crudo — incluido por el websocket, que aplica las mismas
-- policies. El feed sigue viéndose completo porque el DISPLAY va por las vistas
-- enmascaradas, que corren como su dueño y por tanto no aplican estas policies.
--
-- Se aprovecha para cerrar un segundo hueco encontrado en la misma revisión:
-- `bt_delete USING(true)` permitía a cualquier usuario autenticado borrar la
-- publicación de Bitácora de cualquier otro (DELETE /bitacora_posts?id=eq.…).
-- Pasa a ser del autor o de moderación.
--
-- QUÉ *NO* TOCA (a propósito)
--   * INSERT y UPDATE quedan como están (permisivos). Son cross-user por diseño:
--     un guardián marca `taken`/`closed` en el pedido de OTRA persona
--     (_sendLeaveMessage, _seekerDeclineRequest) y las reacciones del Muro
--     escriben en el post ajeno (sbUpdateHappyPost). Cerrarlos rompería la app y
--     es un problema distinto del de la de-anonimización.
--   * Las vistas no cambian de forma, sólo help_posts_feed cambia de modo.
--
-- CAMBIO IMPRESCINDIBLE EN help_posts_feed
-- Se creó con `security_invoker = on`, es decir aplica la RLS de QUIEN CONSULTA.
-- Si se dejara así, la nueva policy también escondería los pedidos anónimos
-- DENTRO de la vista y la Sala de Ayuda aparecería medio vacía. Se pasa a
-- `off` (como happy_posts_full y bitacora_posts_full, que ya funcionan así): la
-- vista corre como su dueño y hace ella misma el enmascarado. auth.uid() sigue
-- devolviendo el usuario de la petición, así que el CASE "es mi fila" no cambia.
--
-- CAMBIOS DE CLIENTE QUE ACOMPAÑAN (v1618, desplegar ANTES que esta migración)
--   * Conteos comunitarios repuntados a las vistas: pulso de comunidad,
--     _loadGuardianStats, stats globales, _updateFeedTabCounts. Con el crudo
--     habrían empezado a contar de menos, en silencio.
--   * Posturas de debate: se leen de bitacora_posts_full.
--   * RPC velo_notify_bitacora_author (abajo): el cliente ya no pide el user_id
--     del autor para avisarle de un comentario o reacción — lo resuelve el
--     servidor. Ese `select('user_id').eq('id',postId)` era, por sí solo, un
--     des-anonimizador: comentabas cualquier post anónimo y te devolvía el autor.
--   * _startFeedPoll: refresco por conteo cada 45 s en las tres secciones, para
--     que las publicaciones anónimas sigan apareciendo en vivo sin websocket.
--   * _btDeletePost usa `.select('id')` para no dar un borrado por hecho si la
--     RLS lo bloquea.
--
-- ESTADO REAL ENCONTRADO EN PRODUCCIÓN (verificado antes de aplicar, 29/07)
-- No coincidía con lo que asumían estos archivos — de ahí que el barrido sea
-- dinámico y no por nombre:
--   help_posts      · help_all               ALL    {anon,authenticated} true
--                   · help_posts_daily_limit INSERT RESTRICTIVE (el tope del plan
--                     gratuito — se conserva)
--   happy_posts     · happy_all              ALL    {anon,authenticated} true
--                   · public_read_happy      SELECT {public}            true
--                     ↑ ESTA NO ESTABA EN NINGÚN ARCHIVO. Una segunda policy de
--                     lectura abierta: cerrar sólo happy_all no habría servido
--                     de nada, porque las permisivas se combinan con OR.
--   bitacora_posts  · bt_select / bt_insert / bt_delete, todas {public} true
--                     (sin policy de UPDATE — no se crea ninguna)
--
-- Tipos confirmados: user_id es `text` en las tres tablas (el comentario de
-- 20260718h suponía uuid en bitacora_posts, y era text); anon/is_anon son
-- boolean NULLABLE, de ahí el coalesce(...,false).
--
-- APLICADA en prod el 29/07/2026 (migración `anon_posts_deanon_fix`).
-- Verificado, simulando un usuario autenticado cualquiera:
--   * publicaciones anónimas ajenas visibles en el crudo: 12→0 (Ayuda),
--     3→0 (Muro), 2→0 (Bitácora). 17 en total dejaron de ser rastreables.
--   * las no anónimas siguen visibles (10 / 7 / 1).
--   * las vistas siguen devolviendo el feed completo (22 / 10 / 3 filas) con el
--     user_id sólo en las no anónimas.
--   * el autor sigue viendo SUS anónimas (la app se las fija arriba) y la vista
--     se las reconoce como propias.
--   * moderación (velo_is_admin) sigue viendo todo.
--   * el RPC avisa al autor de un post anónimo sin que quien comenta pueda leer
--     la fila; sender_id queda registrado.
--   * publicar en las tres secciones sigue funcionando; el tope de 4/24 h cuenta
--     bien las filas propias.
--
-- Nota: el advisor de Supabase marcará help_posts_feed como
-- "Security Definer View". Es intencional: es exactamente lo que le permite leer
-- todas las filas y devolverlas enmascaradas, igual que las otras 7 vistas de
-- máscara que ya estaban así.
--
-- Idempotente.
-- ============================================================================

-- ── 0. La vista del feed de ayuda debe dejar de aplicar la RLS del que consulta
alter view public.help_posts_feed set (security_invoker = off);

-- ── 1. Barrido de las policies PERMISIVAS de SELECT (y de las FOR ALL) ───────
-- Las permisivas se combinan con OR: si queda una sola con USING(true) el
-- candado no sirve de nada. Se borran por catálogo, no por nombre, porque los
-- nombres reales en producción no siempre coinciden con los de estos archivos.
--
-- Se excluyen a propósito las RESTRICTIVE: `help_posts_daily_limit`
-- (20260716d) es restrictive FOR INSERT y hace de tope de 4 pedidos/24 h del
-- plan gratuito. Si se borrara, el límite se podría saltear desde la consola.
-- Su subconsulta cuenta filas propias, que la nueva policy de SELECT sigue
-- dejando ver, así que el tope sigue calculándose bien.
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['help_posts','happy_posts','bitacora_posts'] loop
    for r in
      select policyname
        from pg_policies
       where schemaname = 'public'
         and tablename  = t
         and cmd in ('SELECT','ALL')
         and permissive = 'PERMISSIVE'
    loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $$;

-- Al borrar una policy FOR ALL también se fue el permiso de escribir: se repone
-- explícitamente el comportamiento que había (permisivo, y para los MISMOS roles
-- —`anon` incluido— porque si la sesión de Supabase caducó el cliente inserta
-- con la clave pública y hasta hoy eso funcionaba). Sólo cambia el SELECT, y el
-- DELETE de Bitácora/Muro, que estaba abierto a cualquiera.

-- ── 2. help_posts ───────────────────────────────────────────────────────────
alter table public.help_posts enable row level security;

drop policy if exists help_select_public_or_own on public.help_posts;
create policy help_select_public_or_own on public.help_posts
  for select to authenticated
  using (
    coalesce(anon, false) = false
    or user_id::text = auth.uid()::text
    or public.velo_is_admin()
  );

drop policy if exists help_insert_auth on public.help_posts;
create policy help_insert_auth on public.help_posts
  for insert to anon, authenticated with check (true);

-- Cross-user por diseño: el guardián cierra/toma el pedido de otra persona.
drop policy if exists help_update_auth on public.help_posts;
create policy help_update_auth on public.help_posts
  for update to anon, authenticated using (true) with check (true);

drop policy if exists help_delete_own on public.help_posts;
create policy help_delete_own on public.help_posts
  for delete to authenticated
  using ( user_id::text = auth.uid()::text or public.velo_is_admin() );

-- ── 3. happy_posts (Muro de la Felicidad) ───────────────────────────────────
alter table public.happy_posts enable row level security;

drop policy if exists happy_select_public_or_own on public.happy_posts;
create policy happy_select_public_or_own on public.happy_posts
  for select to authenticated
  using (
    coalesce(anon, false) = false
    or user_id::text = auth.uid()::text
    or public.velo_is_admin()
  );

drop policy if exists happy_insert_auth on public.happy_posts;
create policy happy_insert_auth on public.happy_posts
  for insert to anon, authenticated with check (true);

-- Cross-user por diseño: reacciones y comentarios se guardan en el post ajeno.
drop policy if exists happy_update_auth on public.happy_posts;
create policy happy_update_auth on public.happy_posts
  for update to anon, authenticated using (true) with check (true);

drop policy if exists happy_delete_own on public.happy_posts;
create policy happy_delete_own on public.happy_posts
  for delete to authenticated
  using ( user_id::text = auth.uid()::text or public.velo_is_admin() );

-- ── 4. bitacora_posts ───────────────────────────────────────────────────────
alter table public.bitacora_posts enable row level security;

drop policy if exists bt_select_public_or_own on public.bitacora_posts;
create policy bt_select_public_or_own on public.bitacora_posts
  for select to authenticated
  using (
    coalesce(is_anon, false) = false
    or user_id::text = auth.uid()::text
    or public.velo_is_admin()
  );

drop policy if exists bt_insert on public.bitacora_posts;
drop policy if exists bt_insert_auth on public.bitacora_posts;
create policy bt_insert_auth on public.bitacora_posts
  for insert to anon, authenticated with check (true);

-- Aquí SÍ se cierra: no existe ningún update de bitacora_posts en el cliente y
-- el borrado abierto permitía borrar publicaciones de cualquiera.
drop policy if exists bt_delete on public.bitacora_posts;
drop policy if exists bt_delete_own on public.bitacora_posts;
create policy bt_delete_own on public.bitacora_posts
  for delete to authenticated
  using ( user_id::text = auth.uid()::text or public.velo_is_admin() );

-- Defensa en profundidad: sin sesión no se lee ni se escribe nada del crudo.
revoke select on public.help_posts     from anon;
revoke select on public.happy_posts    from anon;
revoke select on public.bitacora_posts from anon;

-- ── 5. RPC: avisar al autor de un post sin revelar quién es ─────────────────
-- Reemplaza al `select('user_id').eq('id',postId)` del cliente. Resuelve el
-- autor server-side, no devuelve el identificador y reutiliza las mismas
-- salvaguardas que velo_create_notif (remitente verificado, sin auto-avisos,
-- campos recortados).
create or replace function public.velo_notify_bitacora_author(
  p_post_id text,
  p_type    text,
  p_title   text,
  p_body    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if auth.uid() is null then return; end if;

  select bp.user_id::uuid into v_author
    from public.bitacora_posts bp
   where bp.id::text = p_post_id;

  if v_author is null or v_author = auth.uid() then return; end if;

  insert into public.velo_notifications
    (user_id, sender_id, type, title, body, related_id, is_read, created_at)
  values (
    v_author,
    auth.uid(),
    left(coalesce(p_type, ''), 40),
    left(coalesce(p_title, ''), 200),
    nullif(left(coalesce(p_body, ''), 500), ''),
    left(p_post_id, 100),
    false,
    now()
  );
exception when others then
  -- Un id con formato inesperado no debe tirar el comentario ni la reacción.
  return;
end;
$$;

revoke execute on function public.velo_notify_bitacora_author(text,text,text,text) from public;
revoke execute on function public.velo_notify_bitacora_author(text,text,text,text) from anon;
grant  execute on function public.velo_notify_bitacora_author(text,text,text,text) to authenticated;

-- ============================================================================
-- VERIFICACIÓN (ejecutar como un usuario NORMAL autenticado, no service_role)
--
--   -- debe devolver 0 filas: ninguna publicación anónima ajena visible
--   select count(*) from public.bitacora_posts
--    where is_anon and user_id::text <> auth.uid()::text;
--   select count(*) from public.help_posts
--    where anon and user_id::text <> auth.uid()::text;
--   select count(*) from public.happy_posts
--    where anon and user_id::text <> auth.uid()::text;
--
--   -- y el feed debe seguir completo (incluidos los anónimos, con user_id NULL)
--   select count(*), count(user_id) from public.help_posts_feed;
--   select count(*), count(user_id) from public.bitacora_posts_full;
--
-- Además, en la app: abrir Sala de Ayuda, Muro y Bitácora y comprobar que los
-- posts anónimos de otras personas se siguen viendo, que se pueden comentar y
-- que el autor recibe el aviso en la campana 🔔.
-- ============================================================================
