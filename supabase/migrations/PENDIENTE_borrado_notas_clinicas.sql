-- ============================================================================
-- ⚠️ PREPARADA Y PROBADA, **NO APLICADA** (el conector de Supabase estaba
--    caído el 11/08). Aplicar en cuanto vuelva.
--
-- PROBADA DE VERDAD, no sólo escrita: se levantó un PostgreSQL 16 local, se
-- replicaron las 22 tablas implicadas y `auth.uid()`/`auth.jwt()`, y se corrió
-- el borrado con una cuenta sembrada. Resultados:
--
--   Con la función ACTUAL (la de producción):
--     notas clínicas supervivientes ....... 1   ← el fallo
--     sigue en grupos de otras personas ... 1
--     sigue en bloqueos de otras personas . 1
--
--   Con esta versión:
--     notas clínicas supervivientes ....... 0
--     sigue en grupos ajenos .............. 0
--     sigue en bloqueos y favoritos ajenos  0
--     grupo ajeno .............. intacto (se queda su dueño)
--     pedido de ayuda ajeno .... intacto y anonimizado (taken_by a null)
--     constancia de baja ....... registrada
--
-- Las dos ramas del limpiado de listas se probaron por separado, con las
-- columnas como `text[]` y como `jsonb`, porque no está confirmado cuál es el
-- tipo en producción. En `jsonb` se comprobó además que sólo desaparece la
-- persona borrada y las demás siguen en la lista.
--
-- LAS NOTAS CLÍNICAS SOBREVIVEN AL BORRADO DE CUENTA  (detectado 11/08/2026)
--
-- `delete_my_account` borra recorriendo `information_schema` en busca de nueve
-- nombres de columna: user_id, from_id, to_id, owner_id, creator_id, seeker_id,
-- guardian_id, author_id, buddy_id. Más una lista de casos explícitos.
--
-- `pro_patient_notes` no encaja en ninguno de los dos: sus columnas son
-- `pro_id` y `patient_id`. Consecuencia:
--
--   * Si un PACIENTE borra su cuenta, las notas que un profesional escribió
--     sobre él siguen en la base, indexadas por su `patient_id`.
--   * Si el PROFESIONAL borra la suya, sus notas también quedan.
--
-- Son datos de salud sobre una persona identificable sobreviviendo a una
-- petición de supresión (art. 17 RGPD), y son el dato más sensible que guarda
-- la aplicación. La DPIA los trata como categoría especial (art. 9).
--
-- Cómo se detectó: comparando las columnas que escribe el cliente
-- (`_syncPatientNotesToSb`, premium.js) contra las que borra la función. No
-- hacía falta la base — el desajuste está en el propio repositorio.
--
-- ── RESTOS EN COLUMNAS DE TIPO LISTA ───────────────────────────────────────
-- El bucle tampoco puede alcanzar identificadores guardados dentro de un array:
-- quien borra su cuenta sigue figurando en `vibe_groups.member_ids` de los
-- grupos de otras personas, y en `profiles.blocked_users` / `fav_contacts` de
-- las demás. No es dato sensible, pero es su identificador persistiendo.
-- Se limpia comprobando antes el tipo de la columna, porque no está confirmado
-- si son `text[]` o `jsonb` y una suposición equivocada haría fallar el borrado
-- entero. Si el tipo no es ninguno de los dos, se deja como está y avisa.
--
-- ── ANTES DE APLICAR ───────────────────────────────────────────────────────
--   1. Confirmar que la tabla y las columnas se llaman así:
--        select column_name, data_type from information_schema.columns
--         where table_schema='public' and table_name='pro_patient_notes';
--   2. Aplicar.
--   3. Verificar con una cuenta de prueba: sembrar una nota con
--      patient_id = <uid de prueba>, llamar a delete_my_account() con esa
--      sesión, y comprobar que la nota ya no está.
-- ============================================================================

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

  -- NUEVO: notas clínicas, tanto si la persona es el paciente como el profesional.
  begin delete from public.pro_patient_notes where patient_id::text=v_txt or pro_id::text=v_txt; exception when others then raise notice 'delete_my_account: pro_patient_notes (%)', sqlerrm; end;

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

  -- NUEVO: sacar su identificador de las listas de otras personas.
  for r in
    select c.table_name, c.column_name, c.data_type
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema=c.table_schema and t.table_name=c.table_name
     where c.table_schema='public' and t.table_type='BASE TABLE'
       and (c.table_name, c.column_name) in
           (('vibe_groups','member_ids'),('profiles','blocked_users'),('profiles','fav_contacts'))
  loop
    begin
      if r.data_type = 'ARRAY' then
        execute format('update public.%I set %I = array_remove(%I, $1) where $1 = any(%I)',
                       r.table_name, r.column_name, r.column_name, r.column_name) using v_txt;
      elsif r.data_type = 'jsonb' then
        execute format($f$update public.%I set %I = (
                          select coalesce(jsonb_agg(e), '[]'::jsonb)
                            from jsonb_array_elements(%I) e where e <> to_jsonb($1::text))
                        where %I @> to_jsonb($1::text)$f$,
                       r.table_name, r.column_name, r.column_name, r.column_name) using v_txt;
      else
        raise notice 'delete_my_account: %.% es % — no se limpia', r.table_name, r.column_name, r.data_type;
      end if;
    exception when others then
      raise notice 'delete_my_account: lista %.% (%)', r.table_name, r.column_name, sqlerrm;
    end;
  end loop;

  begin delete from public.profiles where id::text = v_txt;
  exception when others then raise notice 'delete_my_account: profiles (%)', sqlerrm; end;

  delete from auth.users where id = v_uid;
end; $$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant  execute on function public.delete_my_account(text) to authenticated;

-- ── VERIFICACIÓN (tras aplicar) ────────────────────────────────────────────
-- Con una cuenta de prueba <uid>:
--   insert into pro_patient_notes(pro_id, patient_id, notes) values ('otro','<uid>','x');
--   -- iniciar sesión como <uid> y llamar a select delete_my_account('prueba');
--   select count(*) from pro_patient_notes where patient_id='<uid>';  -- debe dar 0
