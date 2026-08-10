-- ============================================================================
-- EL BORRADO DE CUENTA: ABORTABA EN LA PRIMERA LÍNEA Y DEJABA RASTROS
-- (07/08/2026) — APLICADA. Dos bugs distintos en la misma función.
--
-- BUG 1 — ABORTABA ANTES DE BORRAR NADA
-- `delete_my_account` empieza registrando la baja en `deleted_accounts`. Ese
-- INSERT no estaba protegido, así que cualquier fallo suyo tumbaba la función
-- entera. Y fallaba siempre:
--   * Hasta el 07/08 la tabla NO EXISTÍA → «relation does not exist».
--   * Al crearla ese día se le pusieron sólo (id, deleted_at, reason), sin
--     `user_id`, que es justo la columna que la función escribe.
-- O sea: el camino principal del derecho de supresión (art. 17) nunca llegó a
-- ejecutarse. Que igual se pudiera borrar fue suerte — el cliente tiene un
-- respaldo tabla por tabla y existe la edge function `delete-account`.
-- Ahora el registro de la baja es NO BLOQUEANTE: dejar constancia es deseable,
-- pero jamás debe impedir que alguien borre sus datos.
--
-- BUG 2 — 17 COLUMNAS EN 14 TABLAS SOBREVIVÍAN
-- El bucle dinámico sólo miraba nueve nombres de columna. Tras «borrar mi
-- cuenta» sobrevivían, entre otras cosas: `contacts.user_email` (el email de la
-- persona con sus mensajes a soporte), su lista de bloqueos, ella como
-- remitente de notificaciones, qué reportó, qué vibes miró, sus referidos y
-- sus reseñas.
--
-- CRITERIO — no todo se borra igual:
--   BORRAR la fila cuando la fila ES de la persona.
--   VACIAR sólo la columna cuando la fila es de OTRA persona y sólo la
--     referencia. `help_posts.taken_by` marca quién acompañó un pedido:
--     borrar por ahí eliminaría **el pedido de ayuda de otra persona**.
--     Igual con `bottles.replied_by` y con el remitente de una notificación
--     que pertenece a quien la recibió.
--   CONSERVAR `donations`: obligación legal de conservación contable
--     (art. 17.3.b RGPD). Excepción expresa, no un olvido.
--
-- VERIFICADO con una cuenta de prueba sembrada en las 14 tablas: tras el
-- borrado quedan 0 rastros en las 12 comprobaciones, la constancia de baja se
-- registra, y el pedido de ayuda y la botella de OTRA persona siguen intactos.
-- ============================================================================

alter table public.deleted_accounts add column if not exists user_id uuid;
create unique index if not exists deleted_accounts_user_id_uidx
  on public.deleted_accounts (user_id) where user_id is not null;

create or replace function public.delete_my_account(p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_txt text; v_mail text; r record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_txt := v_uid::text; v_mail := auth.jwt() ->> 'email';

  begin
    insert into deleted_accounts (user_id, reason, deleted_at)
    values (v_uid, p_reason, now()) on conflict do nothing;
  exception when others then
    raise notice 'delete_my_account: no se pudo registrar la baja (%)', sqlerrm;
  end;

  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema='public' and t.table_type='BASE TABLE'
       and c.column_name in ('user_id','from_id','to_id','owner_id','creator_id',
                             'seeker_id','guardian_id','author_id','buddy_id')
       and c.table_name not in ('profiles','deleted_accounts','donations')
  loop
    begin
      execute format('delete from public.%I where %I::text = $1', r.table_name, r.column_name) using v_txt;
    exception when others then
      raise notice 'delete_my_account: skip %.% (%)', r.table_name, r.column_name, sqlerrm;
    end;
  end loop;

  begin delete from public.user_blocks     where blocker_id::text=v_txt or blocked_id::text=v_txt; exception when others then null; end;
  begin delete from public.vibe_views      where viewer_id::text=v_txt;                            exception when others then null; end;
  begin delete from public.referrals       where referrer_id::text=v_txt or referred_id::text=v_txt; exception when others then null; end;
  begin delete from public.content_reports where reporter_id::text=v_txt;                          exception when others then null; end;
  begin delete from public.support_matches where partner_id::text=v_txt;                           exception when others then null; end;
  begin delete from public.user_favorites  where fav_id::text=v_txt;                               exception when others then null; end;
  begin delete from public.reviews         where pro_id::text=v_txt;                               exception when others then null; end;
  begin delete from public.bookings        where pro_id::text=v_txt;                               exception when others then null; end;
  begin delete from public.sessions        where pro_id::text=v_txt;                               exception when others then null; end;
  if v_mail is not null then
    begin delete from public.contacts where user_email=v_mail;                                     exception when others then null; end;
  end if;

  begin update public.help_posts         set taken_by=null         where taken_by::text=v_txt;         exception when others then null; end;
  begin update public.bottles            set replied_by=null       where replied_by::text=v_txt;       exception when others then null; end;
  begin update public.velo_notifications set sender_id=null        where sender_id::text=v_txt;        exception when others then null; end;
  begin update public.content_reports    set response_user_id=null where response_user_id::text=v_txt; exception when others then null; end;

  begin delete from public.profiles where id::text = v_txt;
  exception when others then raise notice 'delete_my_account: profiles (%)', sqlerrm; end;

  delete from auth.users where id = v_uid;
end; $$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant  execute on function public.delete_my_account(text) to authenticated;
