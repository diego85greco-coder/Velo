begin;

-- 1/3 · Las dos tablas que nunca existieron (Vela por ti y notas de pacientes)
create table if not exists public.solidarity_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,                    -- puede ser null: se permite pedir sin cuenta
  email       text,
  user_name   text,
  tipo        text,
  espec       text,
  urgencia    text,
  horarios    text,
  description text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);
alter table public.solidarity_requests enable row level security;
drop policy if exists sr_insert_own on public.solidarity_requests;
create policy sr_insert_own on public.solidarity_requests
  for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid())::text);
-- Lleva el correo y el motivo por el que alguien pide ayuda que no puede pagar:
-- sólo lo ve quien administra, y la propia persona.
drop policy if exists sr_select_admin_or_own on public.solidarity_requests;
create policy sr_select_admin_or_own on public.solidarity_requests
  for select to authenticated
  using (public.velo_is_admin() or user_id = (select auth.uid())::text);
drop policy if exists sr_update_admin on public.solidarity_requests;
create policy sr_update_admin on public.solidarity_requests
  for update to authenticated using (public.velo_is_admin()) with check (public.velo_is_admin());
drop policy if exists sr_delete_admin on public.solidarity_requests;
create policy sr_delete_admin on public.solidarity_requests
  for delete to authenticated using (public.velo_is_admin());
create index if not exists solidarity_requests_created_idx on public.solidarity_requests (created_at desc);
create index if not exists solidarity_requests_user_idx    on public.solidarity_requests (user_id);
grant select, insert, update, delete on public.solidarity_requests to authenticated;
revoke all on public.solidarity_requests from anon;
-- ── Notas de paciente (sólo del profesional que las escribe) ───────────────
create table if not exists public.pro_patient_notes (
  pro_id     text not null,
  patient_id text not null,
  notes      text,
  updated_at timestamptz not null default now(),
  primary key (pro_id, patient_id)
);
alter table public.pro_patient_notes enable row level security;
-- Datos de salud: los ve SOLO el profesional que los escribió. Sin excepción
-- para admin, a propósito.
drop policy if exists ppn_all_own on public.pro_patient_notes;
create policy ppn_all_own on public.pro_patient_notes
  for all to authenticated
  using (pro_id = (select auth.uid())::text)
  with check (pro_id = (select auth.uid())::text);
create index if not exists pro_patient_notes_patient_idx on public.pro_patient_notes (patient_id);
grant select, insert, update, delete on public.pro_patient_notes to authenticated;
revoke all on public.pro_patient_notes from anon;

-- 2/3 · Borrado de cuenta: alcanzar notas clinicas y listas de otras personas
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

-- 3/3 · Techo global de IA (el cliente elegia su propio cupo)
create or replace function public.velo_consume_quota(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := auth.uid()::text;
  v_limit  int;
  v_used   int;
  v_global int;
  c_global constant int := 150;   -- techo diario por persona sobre ia + ia_sys
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_auth');
  end if;

  v_limit := case p_kind
               when 'ia'     then 25    -- conversación con el acompañante
               when 'ia_sys' then 200   -- moderación, crisis, resúmenes, frases
               when 'email'  then 10
               else 25
             end;

  -- Velo Plus: la conversación es ilimitada y NO cuenta para el techo global.
  -- Se registra como 'ia_plus' justamente para eso. Si contara, una persona con
  -- Plus que hablara mucho —que en esta aplicación suele ser alguien que lo está
  -- pasando mal— se quedaría además sin moderación ni detector de crisis.
  -- El techo existe para acotar el abuso de quien no paga, no para cortar a
  -- quien sí lo hace.
  if p_kind = 'ia' and public.velo_is_premium(v_uid) then
    insert into public.velo_api_usage (user_id, kind) values (v_uid, 'ia_plus');
    return jsonb_build_object('ok', true, 'unlimited', true);
  end if;

  -- Techo global sobre lo que sí puede inflarse mintiendo en `kind`.
  if p_kind in ('ia', 'ia_sys') then
    select count(*) into v_global
      from public.velo_api_usage u
     where u.user_id = v_uid
       and u.kind in ('ia', 'ia_sys')
       and u.created_at > now() - interval '24 hours';
    if v_global >= c_global then
      return jsonb_build_object('ok', false, 'reason', 'global',
                                'limit', c_global, 'used', v_global, 'kind', p_kind);
    end if;
  end if;

  select count(*) into v_used
    from public.velo_api_usage u
   where u.user_id = v_uid
     and u.kind = p_kind
     and u.created_at > now() - interval '24 hours';

  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'reason', 'limit',
                              'limit', v_limit, 'used', v_used, 'kind', p_kind);
  end if;

  insert into public.velo_api_usage (user_id, kind) values (v_uid, p_kind);
  return jsonb_build_object('ok', true, 'remaining', v_limit - v_used - 1, 'kind', p_kind);
end;
$$;

commit;
