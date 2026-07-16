-- Privacidad Bitácora: las vistas bitacora_posts_full / bitacora_comments_full
-- hacían LEFT JOIN a profiles y exponían el NOMBRE/username/avatar REAL del autor
-- incluso en posts/comentarios ANÓNIMOS (la UI lo tapaba, pero viajaba en la red).
--
-- Fix simple y sin romper nada: enmascarar SOLO los campos de identidad unida
-- cuando is_anon = true. Se conserva bp.*/bc.* (incluido user_id) para que sigan
-- funcionando el bloqueo, el "es mío" y la moderación.

drop view if exists public.bitacora_posts_full;
create view public.bitacora_posts_full as
  select
    bp.*,
    case when bp.is_anon then null else p.username end as author_username,
    case when bp.is_anon then null else p.nombre   end as author_name,
    case when bp.is_anon then null else p.avatar    end as author_avatar
  from public.bitacora_posts bp
  left join public.profiles p on p.id = bp.user_id;

drop view if exists public.bitacora_comments_full;
create view public.bitacora_comments_full as
  select
    bc.*,
    case when bc.is_anon then null else p.username end as author_username,
    case when bc.is_anon then null else p.nombre   end as author_name,
    case when bc.is_anon then null else p.avatar    end as author_avatar
  from public.bitacora_comments bc
  left join public.profiles p on p.id::text = bc.user_id;
