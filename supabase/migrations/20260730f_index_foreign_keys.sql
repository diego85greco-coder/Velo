-- ============================================================================
-- ÍNDICES EN LAS CLAVES FORÁNEAS QUE NO LOS TENÍAN  (2026-07-30) — APLICADA
--
-- Las 8 que marcó el analizador de rendimiento de Supabase apuntan a un
-- usuario. Sin índice, cualquier consulta que filtre por esa columna recorre
-- la tabla entera.
--
-- Importa sobre todo en el BORRADO DE CUENTA: el RPC delete_my_account recorre
-- 43 tablas buscando las filas de esa persona. Sin índice, cada una es un
-- barrido completo. Hoy con 19 MB no se nota; con la app abierta al público sí.
--
-- Crear un índice no cambia el comportamiento de nada, sólo la velocidad.
--
-- QUEDA PENDIENTE, a propósito: 113 avisos `auth_rls_initplan`. Son policies
-- que evalúan auth.uid() una vez POR FILA en lugar de una sola vez. El arreglo
-- es mecánico —envolver en (select auth.uid())— pero toca las 113 policies,
-- justo después de rehacerlas todas por seguridad. Con 19 MB no cambia nada
-- medible; conviene hacerlo cuando la base crezca, y con tiempo para verificar
-- una por una.
-- ============================================================================

create index if not exists bottle_reactions_user_id_idx        on public.bottle_reactions (user_id);
create index if not exists bottle_replies_user_id_idx          on public.bottle_replies (user_id);
create index if not exists content_reports_reporter_id_idx     on public.content_reports (reporter_id);
create index if not exists dq_reactions_user_id_idx            on public.dq_reactions (user_id);
create index if not exists profiles_buddy_id_idx               on public.profiles (buddy_id);
create index if not exists vibe_comment_reactions_user_id_idx  on public.vibe_comment_reactions (user_id);
create index if not exists vibe_comments_user_id_idx           on public.vibe_comments (user_id);
create index if not exists vibe_reactions_user_id_idx          on public.vibe_reactions (user_id);
