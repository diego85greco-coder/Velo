-- Privacidad Sala de Ayuda: los posts anónimos ya ocultan nombre ('Usuario
-- Anónimo') y avatar, pero el user_id REAL del autor viajaba en el feed
-- (select('*')), permitiendo desanonimizar vía profiles. No se podía enmascarar
-- sin más porque el guardián que ACOMPAÑA usaba ese user_id del feed para crear
-- el guardian_request y el push — si lo ocultábamos, el que pide ayuda anónimo
-- nunca recibía respuesta.
--
-- Solución: (1) un RPC accept_help_post que resuelve el seeker en el SERVIDOR a
-- partir del post_id y crea el guardian_request + el sentinela de push de forma
-- atómica (identidad del guardián = auth.uid, no spoofeable); (2) una vista
-- help_posts_feed que enmascara user_id → NULL en posts anónimos salvo para su
-- autor. Así el user_id sale del feed y solo se usa al aceptar, server-side.

-- ── RPC: aceptar acompañar un pedido ────────────────────────────────
create or replace function public.accept_help_post(
  p_post_id       text,
  p_req_id        text,
  p_guardian_name text,
  p_guardian_av   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_seeker text;
  v_dm_id  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;

  -- Seeker resuelto server-side desde el post (el feed ya no lo expone).
  select user_id into v_seeker from public.help_posts where id = p_post_id;
  if v_seeker is null then
    return jsonb_build_object('ok', false, 'reason', 'no_seeker');
  end if;

  insert into public.guardian_requests
    (id, post_id, seeker_id, guardian_id, guardian_name, guardian_av, status)
  values
    (p_req_id, p_post_id, v_seeker, v_uid,
     coalesce(nullif(p_guardian_name, ''), 'Guardián'),
     coalesce(nullif(p_guardian_av,   ''), '🌿'), 'pending');

  -- Sentinela de push "alguien quiere acompañarte" (si el guardián no es el autor).
  if v_seeker <> v_uid then
    insert into public.direct_messages (from_id, from_name, from_av, to_id, text)
    values (v_uid,
            coalesce(nullif(p_guardian_name, ''), 'Guardián'),
            coalesce(nullif(p_guardian_av,   ''), '🌿'),
            v_seeker, '__velo_accompany_req__')
    returning id into v_dm_id;
  end if;

  return jsonb_build_object('ok', true, 'dm_id', v_dm_id);
end;
$$;
revoke all on function public.accept_help_post(text,text,text,text) from public, anon;
grant execute on function public.accept_help_post(text,text,text,text) to authenticated;

-- ── Vista del feed con user_id enmascarado en anónimos ──────────────
create or replace view public.help_posts_feed
with (security_invoker = on) as
  select
    hp.id, hp.emoji, hp.preview, hp.urgencia, hp.taken, hp.taken_by,
    hp.closed, hp.anon, hp.user_name, hp.user_av, hp.created_at,
    case
      when hp.anon and hp.user_id is distinct from auth.uid()::text
      then null
      else hp.user_id
    end as user_id
  from public.help_posts hp;

grant select on public.help_posts_feed to anon, authenticated;
