-- ============================================================================
-- MÁSCARA DE DEANONIMIZACIÓN — dq_comments — 2026-07-18
--
-- dq_comments guarda los anónimos con user_name = 'Anónimo' pero user_id SIEMPRE
-- presente -> el user_id se filtraba al anon. Igual que el piloto momento_comments,
-- pero: (a) el anónimo se detecta por user_name='Anónimo' (no vacío), y (b) hay
-- queries de conteo propias (.eq('user_id', mi_uid)), así que la vista revela el
-- user_id también en MIS PROPIAS filas (user_id = auth.uid()), para que esos
-- conteos sigan funcionando sin filtrar lo ajeno.
-- ============================================================================

create or replace view public.dq_comments_feed as
  select
    id, response_id, text, user_name, user_avatar,
    case
      when (coalesce(user_name, '') not in ('', 'Anónimo')) or user_id = (auth.uid())::text
      then user_id else null
    end as user_id,
    created_at
  from public.dq_comments;

grant select on public.dq_comments_feed to anon, authenticated;
revoke select on public.dq_comments from anon, authenticated;
