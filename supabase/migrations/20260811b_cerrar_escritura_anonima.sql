-- ============================================================================
-- SIN CUENTA SE PODÍA REESCRIBIR TODA LA SALA DE AYUDA Y EL MURO  (11/08/2026)
--
-- Las políticas `help_update_auth` y `happy_update_auth` estaban declaradas
-- `to {anon, authenticated} using (true) with check (true)`, y `anon` tenía el
-- grant de UPDATE. Es decir: sin ninguna cuenta, con la clave pública que está
-- en el repositorio.
--
-- Comprobado contra producción como `anon`, con rollback (nada se modificó):
--
--   update help_posts  set preview = 'VANDALIZADO'      → 22 filas
--   update help_posts  set taken = true, closed = true  → 22 filas
--   update happy_posts set text = 'VANDALIZADO'         → 10 filas
--
-- Una sola petición HTTP borraba el texto de todos los pedidos de ayuda —
-- incluidos los de gente en crisis— o los marcaba todos como atendidos.
--
-- Lo mismo con INSERT: `help_insert_auth`, `happy_insert_auth`, `bt_insert_auth`
-- y las de comentarios estaban abiertas a `anon` con `true`, así que cualquiera
-- podía publicar sin registrarse.
--
-- POR QUÉ ESTABA EN `true`, Y POR QUÉ NO ALCANZA CON PONER «sólo el dueño»:
-- son escrituras que un tercero hace legítimamente sobre la fila de otro. En el
-- Muro las reacciones y los comentarios se guardan en columnas de la propia
-- publicación; en la Sala de Ayuda otra persona marca tu pedido como tomado.
-- Restringir por dueño rompería las dos cosas.
--
-- La solución es limitar **qué columnas** se pueden tocar, no quién. Auditado
-- en premium.js, el cliente sólo escribe:
--   help_posts  → {closed:true} y {taken:false, taken_by:null}
--   happy_posts → {reactions} y {comments}
-- `taken = true` no se escribe directo: pasa por la RPC `accept_help_post`,
-- que es SECURITY DEFINER y no depende de estos grants.
-- Con el grant por columna, ni siquiera una cuenta registrada puede reescribir
-- el texto de una publicación ajena.
--
-- NO se toca `help_posts_daily_limit` (ver 20260811c) ni las tablas donde
-- escribir sin cuenta es intencional: `contacts` (formulario de contacto de la
-- web pública), `bot_attempts`, `terms_acceptance`, `donations`, `surveys`.
-- ============================================================================

-- ── 1. UPDATE: sólo cuentas registradas, y sólo las columnas que el cliente usa
drop policy if exists help_update_auth on public.help_posts;
create policy help_update_auth on public.help_posts
  for update to authenticated using (true) with check (true);
revoke update on public.help_posts from anon, authenticated;
grant  update (taken, taken_by, closed) on public.help_posts to authenticated;

drop policy if exists happy_update_auth on public.happy_posts;
create policy happy_update_auth on public.happy_posts
  for update to authenticated using (true) with check (true);
revoke update on public.happy_posts from anon, authenticated;
grant  update (reactions, comments) on public.happy_posts to authenticated;

-- ── 2. INSERT: publicar exige cuenta
drop policy if exists help_insert_auth  on public.help_posts;
create policy help_insert_auth  on public.help_posts  for insert to authenticated with check (true);

drop policy if exists happy_insert_auth on public.happy_posts;
create policy happy_insert_auth on public.happy_posts for insert to authenticated with check (true);

drop policy if exists bt_insert_auth on public.bitacora_posts;
create policy bt_insert_auth on public.bitacora_posts for insert to authenticated with check (true);

drop policy if exists bt_cm_insert on public.bitacora_comments;
create policy bt_cm_insert on public.bitacora_comments for insert to authenticated with check (true);

drop policy if exists bt_cm_rx_insert on public.bitacora_comment_reactions;
create policy bt_cm_rx_insert on public.bitacora_comment_reactions for insert to authenticated with check (true);

drop policy if exists circle_msg_insert on public.circle_messages;
create policy circle_msg_insert on public.circle_messages for insert to authenticated with check (true);

drop policy if exists insert_all on public.dq_comments;
create policy insert_all on public.dq_comments for insert to authenticated with check (true);

drop policy if exists insert_comments on public.momento_comments;
create policy insert_comments on public.momento_comments for insert to authenticated with check (true);

revoke insert on public.help_posts, public.happy_posts, public.bitacora_posts,
                 public.bitacora_comments, public.bitacora_comment_reactions,
                 public.circle_messages, public.dq_comments, public.momento_comments
  from anon;

-- ── 3. TRUNCATE: no lo filtra RLS, y nadie lo necesita
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('revoke truncate on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
