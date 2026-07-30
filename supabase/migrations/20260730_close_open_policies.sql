-- ============================================================================
-- CIERRE DE LAS POLICIES `USING(true)` QUE QUEDABAN  (2026-07-30)
--
-- Los avisos de seguridad de Supabase, revisados tras el arreglo de anonimato
-- del 29/07, destaparon 14 tablas con la misma clase de hueco que ya se cerró en
-- diario/ánimos el 24/07: una policy que autoriza a cualquiera, con o sin sesión.
-- Con la clave pública (que viaja en el navegador) se podía leer, alterar y
-- borrar contenido de otras personas.
--
-- Antes de tocar nada se auditó CADA lectura y escritura del cliente, una por
-- una. Es el paso que no se dio con daily_responses el 24/07 y que rompió el
-- Pulso de Comunidad. Los sitios que justifican cada decisión están citados.
--
-- CORRECCIÓN A LA NOTA DEL 29/07: se dijo que `plus_grants` permitía darse Velo
-- Plus sin pagar. Es falso: nada lee esa tabla para autorizar. Quien decide es
-- `profiles.role`, y ya está protegido por el trigger `trg_velo_protect_role`
-- (20260716g). `plus_grants` es sólo un registro histórico; igual se cierra.
--
-- LO MÁS GRAVE QUE SÍ HABÍA:
--   * `reportes` — cualquier usuario podía leer TODOS los reportes, incluidos los
--     de categoría `crisis%`. Es el mismo tipo de fuga que moderation_flags el
--     24/07, y sobre el dato más sensible que maneja la app.
--   * `happy_history` — cualquiera podía borrar el historial del Muro de todos.
--   * `contacts` — cualquiera podía leer los mensajes que la gente manda al
--     formulario de contacto, con su email.
--   * `terms_acceptance` — la constancia de consentimiento (art. 7.1) se podía
--     leer y alterar. Es justo la prueba que sirve para demostrarlo.
--   * `user_blocks` — se podían leer y quitar los bloqueos de otra persona.
--
-- BUG CORREGIDO DE PASO: `momentos` tenía RLS activo y NINGUNA policy de DELETE,
-- así que `pDeleteMomento` no borraba nada — devolvía "ok" con 0 filas y el
-- momento reaparecía al refrescar. Ahora hay policy de borrado (autor o
-- moderación) y por primera vez funciona.
--
-- Idempotente.
-- ============================================================================

-- ── plus_grants — registro histórico, nadie lo lee para autorizar ───────────
-- Cliente: sólo dos INSERT (premium.js:29017, 33493), ambos del módulo de
-- profesionales que está oculto, y ambos escriben una columna `note` que no
-- existe en la tabla → hoy ya fallan en silencio. Se cierra del todo.
drop policy if exists allow_all on public.plus_grants;
drop policy if exists plus_grants_admin_read on public.plus_grants;
create policy plus_grants_admin_read on public.plus_grants
  for select to authenticated using ( public.velo_is_admin() );
revoke insert, update, delete on public.plus_grants from anon, authenticated;

-- ── happy_history — historial propio del Muro ───────────────────────────────
-- Cliente: upsert/insert propios (19228, 19233, 19893) y select filtrado por
-- user_id propio (19374, 19378). Ninguna lectura comunitaria → dueño y basta.
-- Las 20 filas existentes están todas indexadas por uuid, así que nadie pierde
-- acceso a lo suyo.
drop policy if exists public_read   on public.happy_history;
drop policy if exists public_insert on public.happy_history;
drop policy if exists public_delete on public.happy_history;

drop policy if exists happy_hist_select_own on public.happy_history;
create policy happy_hist_select_own on public.happy_history
  for select to authenticated
  using ( user_id = auth.uid()::text or public.velo_is_admin() );

drop policy if exists happy_hist_insert_own on public.happy_history;
create policy happy_hist_insert_own on public.happy_history
  for insert to authenticated with check ( user_id = auth.uid()::text );

-- El upsert de 19228 necesita UPDATE además de INSERT.
drop policy if exists happy_hist_update_own on public.happy_history;
create policy happy_hist_update_own on public.happy_history
  for update to authenticated
  using ( user_id = auth.uid()::text ) with check ( user_id = auth.uid()::text );

drop policy if exists happy_hist_delete_own on public.happy_history;
create policy happy_hist_delete_own on public.happy_history
  for delete to authenticated
  using ( user_id = auth.uid()::text or public.velo_is_admin() );

-- ── terms_acceptance — constancia de consentimiento (art. 7.1) ──────────────
-- Cliente: un INSERT en el registro (4885), que corre ANTES de que exista
-- sesión → el INSERT tiene que seguir abierto a `anon`. La lectura (31932) es
-- del panel de administración. Nadie debe poder modificar ni borrar la
-- constancia: si se puede alterar, deja de servir como prueba.
drop policy if exists allow_all on public.terms_acceptance;

drop policy if exists terms_insert_any on public.terms_acceptance;
create policy terms_insert_any on public.terms_acceptance
  for insert to anon, authenticated with check (true);

drop policy if exists terms_select_admin on public.terms_acceptance;
create policy terms_select_admin on public.terms_acceptance
  for select to authenticated using ( public.velo_is_admin() );

revoke update, delete on public.terms_acceptance from anon, authenticated;

-- ── user_blocks — a quién bloqueaste, y quién te bloqueó ────────────────────
-- Cliente: lee los propios (899), y también las filas donde el bloqueado sos
-- vos (25869) para no mostrarte a quien te bloqueó. Escribe sólo los propios
-- (25588 upsert, 25606 delete). Columnas uuid.
drop policy if exists allow_all on public.user_blocks;

drop policy if exists blocks_select_involved on public.user_blocks;
create policy blocks_select_involved on public.user_blocks
  for select to authenticated
  using ( blocker_id = auth.uid() or blocked_id = auth.uid() );

drop policy if exists blocks_insert_own on public.user_blocks;
create policy blocks_insert_own on public.user_blocks
  for insert to authenticated with check ( blocker_id = auth.uid() );

drop policy if exists blocks_update_own on public.user_blocks;
create policy blocks_update_own on public.user_blocks
  for update to authenticated
  using ( blocker_id = auth.uid() ) with check ( blocker_id = auth.uid() );

drop policy if exists blocks_delete_own on public.user_blocks;
create policy blocks_delete_own on public.user_blocks
  for delete to authenticated using ( blocker_id = auth.uid() );

-- ── contacts — formulario de contacto ───────────────────────────────────────
-- Cliente: envía (33288, puede no haber sesión), el usuario lee SUS respuestas
-- por email (sbLoadRepliedContacts, 33544) y el resto es panel de
-- administración (33305 listar, 33526/33532 marcar y responder, 31845 borrar).
drop policy if exists allow_all   on public.contacts;
drop policy if exists insert_open on public.contacts;
drop policy if exists read_open   on public.contacts;
drop policy if exists update_open on public.contacts;

drop policy if exists contacts_insert_any on public.contacts;
create policy contacts_insert_any on public.contacts
  for insert to anon, authenticated with check (true);

drop policy if exists contacts_select_own_or_admin on public.contacts;
create policy contacts_select_own_or_admin on public.contacts
  for select to authenticated
  using ( user_email = (auth.jwt() ->> 'email') or public.velo_is_admin() );

drop policy if exists contacts_update_admin on public.contacts;
create policy contacts_update_admin on public.contacts
  for update to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete to authenticated using ( public.velo_is_admin() );

-- ── admin_news — avisos que ve todo el mundo ────────────────────────────────
-- Cliente: sbLoadAdminNews (33324) los lee para MOSTRARLOS a cualquiera → la
-- lectura queda abierta. Publicar, activar y borrar (33313, 33332, 33337) es
-- del panel. Sin esto, cualquiera podía publicar un aviso con pinta de oficial.
drop policy if exists allow_all on public.admin_news;

drop policy if exists news_select_any on public.admin_news;
create policy news_select_any on public.admin_news
  for select to anon, authenticated using (true);

drop policy if exists news_insert_admin on public.admin_news;
create policy news_insert_admin on public.admin_news
  for insert to authenticated with check ( public.velo_is_admin() );

drop policy if exists news_update_admin on public.admin_news;
create policy news_update_admin on public.admin_news
  for update to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

drop policy if exists news_delete_admin on public.admin_news;
create policy news_delete_admin on public.admin_news
  for delete to authenticated using ( public.velo_is_admin() );

-- ── donations — aportes ─────────────────────────────────────────────────────
-- Cliente: registra el aporte (36180) y el panel lista (33407). Nadie más
-- debería ver quién donó ni cuánto.
drop policy if exists allow_all on public.donations;

drop policy if exists donations_insert_any on public.donations;
create policy donations_insert_any on public.donations
  for insert to anon, authenticated with check (true);

drop policy if exists donations_select_admin on public.donations;
create policy donations_select_admin on public.donations
  for select to authenticated using ( public.velo_is_admin() );

revoke update, delete on public.donations from anon, authenticated;

-- ── guardian_presence — directorio de quién está disponible ─────────────────
-- Es un directorio público por diseño: se lee de otras personas en 9078, 9825,
-- 15116, 26082, 10248, 31484, 1013 → la lectura queda abierta. Escribir, en
-- cambio, sólo la propia fila: hasta ahora cualquiera podía cambiarle a otro el
-- nombre, el estado o la valoración.
-- 5 de las 14 filas están indexadas por email (legado), así que la condición
-- acepta también el email del JWT y sus dueños no pierden el control.
drop policy if exists gp_all on public.guardian_presence;

drop policy if exists gp_select_any on public.guardian_presence;
create policy gp_select_any on public.guardian_presence
  for select to anon, authenticated using (true);

drop policy if exists gp_insert_own on public.guardian_presence;
create policy gp_insert_own on public.guardian_presence
  for insert to authenticated
  with check ( user_id = auth.uid()::text or user_id = (auth.jwt() ->> 'email') );

drop policy if exists gp_update_own on public.guardian_presence;
create policy gp_update_own on public.guardian_presence
  for update to authenticated
  using ( user_id = auth.uid()::text or user_id = (auth.jwt() ->> 'email') )
  with check ( user_id = auth.uid()::text or user_id = (auth.jwt() ->> 'email') );

drop policy if exists gp_delete_own on public.guardian_presence;
create policy gp_delete_own on public.guardian_presence
  for delete to authenticated
  using ( user_id = auth.uid()::text or user_id = (auth.jwt() ->> 'email')
          or public.velo_is_admin() );

-- ── bitacora_reactions — reacciones a las historias ─────────────────────────
-- La lectura es cross-user por diseño (los conteos de 37502, 37887 y las
-- estadísticas). Poner y quitar, en cambio, sólo lo propio: `bt_rx_delete`
-- con USING(true) dejaba borrar las reacciones de cualquiera. El cliente ya
-- filtra por user_id al borrar (38331), así que no cambia nada para el uso real.
drop policy if exists bt_rx_insert on public.bitacora_reactions;
create policy bt_rx_insert on public.bitacora_reactions
  for insert to authenticated with check ( user_id = auth.uid()::text );

drop policy if exists bt_rx_delete on public.bitacora_reactions;
create policy bt_rx_delete on public.bitacora_reactions
  for delete to authenticated
  using ( user_id = auth.uid()::text or public.velo_is_admin() );

-- ── momentos ────────────────────────────────────────────────────────────────
-- Lectura pública (se dejan las dos policies de SELECT tal cual: las
-- estadísticas propias leen momentos ya expirados).
-- `momentos_update_hearts_only` mentía: permitía cambiar CUALQUIER columna de
-- CUALQUIER momento, no sólo los corazones. Se cierra al autor. Los corazones
-- siguen funcionando porque el camino real es el RPC `increment_momento_hearts`
-- (security definer, atómico); el update directo del cliente (36081) es sólo un
-- respaldo para cuando el RPC no existe, y existe.
-- El INSERT admite user_id nulo (así se publica un momento anónimo) pero impide
-- publicar en nombre de otra persona.
drop policy if exists insert_all on public.momentos;
create policy insert_all on public.momentos
  for insert to anon, authenticated
  with check ( user_id is null or user_id = auth.uid() );

drop policy if exists momentos_update_hearts_only on public.momentos;
drop policy if exists momentos_update_own on public.momentos;
create policy momentos_update_own on public.momentos
  for update to authenticated
  using ( user_id = auth.uid() or public.velo_is_admin() )
  with check ( user_id = auth.uid() or public.velo_is_admin() );

-- No existía NINGUNA policy de DELETE: pDeleteMomento (35610) no borraba nada.
drop policy if exists momentos_delete_own on public.momentos;
create policy momentos_delete_own on public.momentos
  for delete to authenticated
  using ( user_id = auth.uid() or public.velo_is_admin() );

-- ── reviews — reseñas entre usuarios ────────────────────────────────────────
-- Se muestran en los perfiles públicos (17549, 18897, 32537) → lectura abierta.
-- Escribe quien reseña (28234, user_id propio); responde la persona reseñada
-- (18962, su pro_id); borra cualquiera de las dos partes o moderación (19008).
drop policy if exists allow_all on public.reviews;

drop policy if exists reviews_select_any on public.reviews;
create policy reviews_select_any on public.reviews
  for select to anon, authenticated using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews
  for insert to authenticated with check ( user_id = auth.uid()::text );

drop policy if exists reviews_update_reviewee on public.reviews;
create policy reviews_update_reviewee on public.reviews
  for update to authenticated
  using ( pro_id = auth.uid()::text or public.velo_is_admin() )
  with check ( pro_id = auth.uid()::text or public.velo_is_admin() );

drop policy if exists reviews_delete_involved on public.reviews;
create policy reviews_delete_involved on public.reviews
  for delete to authenticated
  using ( user_id = auth.uid()::text or pro_id = auth.uid()::text
          or public.velo_is_admin() );

-- ── reportes — reportes de usuarios, incluidos los de crisis ────────────────
-- LO MÁS SENSIBLE DE ESTA TANDA. `allow_all` dejaba a cualquier persona leer
-- todos los reportes, y sbLoadCrisisEvents (33276) filtra por `categoria` que
-- empieza con 'crisis' — o sea que el listado de quién atravesó una crisis era
-- legible por cualquiera con la clave pública.
-- Cliente: enviar (33254, 33263, puede no haber sesión) y el resto es panel
-- (29174, 29710, 33276 leer; 31674, 32031, 32068 resolver).
drop policy if exists allow_all on public.reportes;

drop policy if exists reportes_insert_any on public.reportes;
create policy reportes_insert_any on public.reportes
  for insert to anon, authenticated with check (true);

drop policy if exists reportes_select_admin on public.reportes;
create policy reportes_select_admin on public.reportes
  for select to authenticated using ( public.velo_is_admin() );

drop policy if exists reportes_update_admin on public.reportes;
create policy reportes_update_admin on public.reportes
  for update to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

revoke delete on public.reportes from anon, authenticated;

-- ── bookings y sessions — módulo de profesionales, retirado ─────────────────
-- La sección está oculta y ambas tablas están vacías. Se cierran a moderación
-- para que no queden como puerta abierta si algún día se reactivan.
drop policy if exists allow_all on public.bookings;
drop policy if exists bookings_admin on public.bookings;
create policy bookings_admin on public.bookings
  for all to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

drop policy if exists admin_all on public.sessions;
drop policy if exists sessions_admin on public.sessions;
create policy sessions_admin on public.sessions
  for all to authenticated
  using ( public.velo_is_admin() ) with check ( public.velo_is_admin() );

-- ============================================================================
-- VERIFICACIÓN — al final del archivo hay que comprobar, simulando un usuario
-- normal, que NO lee reportes, contacts ajenos, terms_acceptance, donations ni
-- plus_grants; que SÍ lee admin_news, guardian_presence, reviews y momentos; y
-- que sigue pudiendo escribir lo suyo (bloqueos, reacciones, historial del
-- Muro, presencia, momentos, reseñas y el formulario de contacto).
-- ============================================================================

-- ============================================================================
-- APLICADA en prod el 30/07/2026 (migraciones `close_open_policies` y
-- `bitacora_reports_hide_reporter`).
--
-- RESULTADO, comprobado simulando un usuario normal y un admin:
--   * Usuario normal ve 0 filas en: reportes (incluidos los de crisis),
--     contacts ajenos, terms_acceptance, donations, plus_grants, happy_history
--     ajeno, bloqueos ajenos, bookings y sessions. Moderación ve 1 de cada una
--     en la misma prueba (sembrando una fila), así que el panel sigue entero.
--   * Siguen abiertas las lecturas que deben estarlo: avisos, directorio de
--     guardianes (14), reseñas (4), momentos (15) y reacciones (10).
--   * Siguen funcionando las 10 escrituras propias: bloqueos, historial del
--     Muro, presencia, reacciones, momentos, reseñas, contacto, reporte,
--     constancia de términos y donación.
--   * Los ataques dan 0 filas: renombrar la presencia de otro, borrar el
--     historial o las reacciones ajenas, borrar o editar momentos ajenos,
--     alterar reseñas ajenas, quitar bloqueos ajenos, responder contactos
--     ajenos y cerrar reportes ajenos.
--   * BUG CORREGIDO: borrar un momento propio pasó de 0 filas a 1.
--   * Los corazones siguen andando por el RPC increment_momento_hearts
--     (de hecho `authenticated` nunca tuvo el GRANT de UPDATE sobre momentos,
--     así que el update directo del cliente era código muerto).
--
-- ESTADO FINAL de las policies abiertas en toda la base:
--   ALL    con USING(true): 0   (eran 13)
--   DELETE con USING(true): 0   (eran 3)
--   UPDATE con USING(true): 2   — help_posts y happy_posts, a propósito: el
--                                 guardián cierra el pedido ajeno y las
--                                 reacciones escriben en el post ajeno.
--   SELECT con USING(true): 18  — todas de contenido público por diseño
--                                 (perfiles, comentarios, reacciones, círculos,
--                                 momentos, reseñas, avisos, directorio).
--   INSERT con CHECK(true): las de publicar contenido. Es lo que hace una red
--                           social; el abuso se ataja con moderación y con los
--                           topes diarios, no con RLS.
-- ============================================================================
