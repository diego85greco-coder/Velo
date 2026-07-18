-- ============================================================================
-- MÁSCARA DE DEANONIMIZACIÓN — bitacora_comments — 2026-07-18
--
-- La vista bitacora_comments_full ya enmascaraba los datos de perfil (author_*)
-- en anónimos, pero CONSERVABA user_id (bc.*) -> user_id se filtraba al anon.
-- La redefinimos ocultando también user_id salvo: comentario NO anónimo, o fila
-- propia (user_id = auth.uid, para que los conteos propios sigan). Y revocamos
-- el SELECT del crudo. user_id es TEXT (el join hace p.id::text = bc.user_id).
--
-- La vista NO es security_invoker -> corre con privilegios del owner, así que
-- sigue leyendo bitacora_comments/profiles aunque revoquemos el crudo al invocador.
-- auth.uid() dentro de la vista es el del REQUESTER (claim del JWT), no del owner.
-- ============================================================================

drop view if exists public.bitacora_comments_full;
create view public.bitacora_comments_full as
  select
    bc.id, bc.post_id, bc.content, bc.is_anon, bc.created_at,
    case when (not bc.is_anon) or bc.user_id = (auth.uid())::text
         then bc.user_id else null end as user_id,
    case when bc.is_anon then null else p.username end as author_username,
    case when bc.is_anon then null else p.nombre   end as author_name,
    case when bc.is_anon then null else p.avatar    end as author_avatar
  from public.bitacora_comments bc
  left join public.profiles p on p.id::text = bc.user_id;

grant select on public.bitacora_comments_full to anon, authenticated;
revoke select on public.bitacora_comments from anon, authenticated;
