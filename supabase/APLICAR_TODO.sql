-- ════════════════════════════════════════════════════════════════════════════
--  VELO — TODO LO PENDIENTE, EN UN SOLO ARCHIVO         11/08/2026
--
--  CÓMO USARLO
--    1. Supabase → SQL Editor → New query
--    2. Pegar TODO esto y darle a Run
--    3. Copiarme la tabla que sale al final (son 8 filas)
--
--  Es seguro pegarlo entero: va dentro de una transacción, así que si algo
--  falla no se aplica NADA — no puede quedar a medias.
--
--  Cada bloque está probado en un PostgreSQL 16 local con el esquema replicado.
--  El detalle de por qué existe cada uno está en supabase/migrations/.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1/4 · CREAR LAS DOS TABLAS QUE NUNCA EXISTIERON
--
-- «Vela por ti» inserta en `solidarity_requests` y las notas de los
-- profesionales en `pro_patient_notes`. Ninguna de las dos existe (PGRST205),
-- y los insert están dentro de try/catch que se tragan el error. Resultado: la
-- persona ve «Solicitud enviada, te contactaremos en 7-14 días» y no se guarda
-- nada; el panel lee esa misma tabla y siempre la ve vacía.
-- ─────────────────────────────────────────────────────────────────────────────
-- ── «Vela por ti»: solicitudes de sesión solidaria ─────────────────────────
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

-- Cada quien puede crear la suya. `user_id` null se acepta porque el formulario
-- se puede enviar sin haber iniciado sesión.
drop policy if exists sr_insert_own on public.solidarity_requests;
create policy sr_insert_own on public.solidarity_requests
  for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid())::text);

-- Contiene el correo y el motivo por el que alguien pide ayuda que no puede
-- pagar. Sólo lo ve quien administra, y la propia persona.
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

-- Son datos de salud. Las ve y las escribe SOLO el profesional que las hizo:
-- ni el paciente ni quien administra. No se añade excepción para admin a
-- propósito — nadie necesita leer la nota clínica de otra persona.
drop policy if exists ppn_all_own on public.pro_patient_notes;
create policy ppn_all_own on public.pro_patient_notes
  for all to authenticated
  using (pro_id = (select auth.uid())::text)
  with check (pro_id = (select auth.uid())::text);

create index if not exists pro_patient_notes_patient_idx on public.pro_patient_notes (patient_id);

grant select, insert, update, delete on public.pro_patient_notes to authenticated;
revoke all on public.pro_patient_notes from anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2/4 · BORRADO DE CUENTA COMPLETO
--
-- `delete_my_account` borra recorriendo nueve nombres de columna.
-- `pro_patient_notes` usa pro_id/patient_id, así que las notas clínicas sobre
-- una persona sobrevivían a su baja. Tampoco alcanzaba a su identificador
-- dentro de listas de otras personas (grupos, bloqueos, favoritos).
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3/4 · TOPE GLOBAL DE IA
--
-- api/gemini.js decide contra qué cupo cobrar leyendo `kind` del cuerpo de la
-- petición: lo elige el cliente. Cualquiera con cuenta puede mandar 'ia_sys' en
-- cada mensaje y usar 200 llamadas al día en vez de 25. El crédito de Gemini es
-- prepago; al agotarse dejan de correr la moderación y el detector de crisis.
--
-- Las conversaciones con Velo Plus se registran aparte ('ia_plus') y NO cuentan
-- para el techo: quien más habla con el acompañante suele ser quien peor lo
-- está pasando.
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ════════════════════════════════════════════════════════════════════════════
--  COMPROBACIÓN — copiame estas 8 filas
-- ════════════════════════════════════════════════════════════════════════════
select * from (
  select 1 as n, 'las 2 tablas existen' as comprobacion,
         count(*)::text as resultado, '2' as esperado
    from information_schema.tables
   where table_schema='public' and table_name in ('solidarity_requests','pro_patient_notes')
  union all
  select 2, 'con RLS activada', count(*)::text, '2'
    from pg_class where relnamespace='public'::regnamespace
     and relname in ('solidarity_requests','pro_patient_notes') and relrowsecurity
  union all
  select 3, 'cerradas a los anonimos', coalesce(count(*),0)::text, '0'
    from information_schema.role_table_grants
   where table_schema='public' and grantee='anon'
     and table_name in ('solidarity_requests','pro_patient_notes')
  union all
  select 4, 'el borrado alcanza las notas clinicas',
         case when pg_get_functiondef(p.oid) like '%pro_patient_notes%' then 'si' else 'NO' end, 'si'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='delete_my_account'
  union all
  select 5, 'el borrado limpia listas ajenas',
         case when pg_get_functiondef(p.oid) like '%array_remove%' then 'si' else 'NO' end, 'si'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='delete_my_account'
  union all
  select 6, 'el cupo de IA tiene techo global',
         case when pg_get_functiondef(p.oid) like '%ia_plus%' then 'si' else 'NO' end, 'si'
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='velo_consume_quota'
  union all
  select 7, 'no se toco ningun dato (ayuda/muro/perfiles)',
         (select count(*) from public.help_posts)::text||'/'||
         (select count(*) from public.happy_posts)::text||'/'||
         (select count(*) from public.profiles)::text, '22/10/11'
  union all
  select 8, 'contenido todavia legible sin cuenta',
         (select count(*)::text from information_schema.role_table_grants
           where table_schema='public' and grantee='anon' and privilege_type='SELECT'
             and table_name in ('momentos','vibes','circles','daily_responses_feed',
                                'vibe_comments','vibe_groups','vibe_reactions',
                                'dq_comments_feed','momento_comments_feed',
                                'bitacora_comments_full','reviews','guardian_presence')),
         'no es un fallo: lo cierra el paso 4/4'
) t order by n;

-- ════════════════════════════════════════════════════════════════════════════
--  4/4 · CERRAR MOMENTOS, VIBES Y CÍRCULOS A LOS ANÓNIMOS
--
--  ⚠️ ESTE VA APARTE, Y DESPUÉS. No está incluido arriba a propósito.
--
--  Hoy cualquiera puede descargar sin cuenta lo que la gente publicó en
--  Momentos, Vibes, Círculos y los comentarios. Lo privado (mensajes, sesiones,
--  notificaciones, bloqueos) ya está protegido — esto es sólo el contenido.
--
--  El cambio de cliente que hacía falta ya está desplegado (v1631: la primera
--  consulta espera a que la sesión esté restaurada). Aun así lo dejo separado
--  porque es el único de los cuatro que, si algo saliera mal, se vería: las
--  secciones aparecerían vacías al abrir la app. En este proyecto cerrar un
--  permiso sin comprobar quién lo usaba ya rompió producción dos veces.
--
--  QUÉ HACER: abrí Velo, entrá a Momentos, Vibes y Círculos y mirá que carguen.
--  Si va bien, quitá los guiones de las 8 líneas de abajo y ejecutalas.
--  Si algo quedara vacío, se revierte al instante con el `grant` del final.
-- ════════════════════════════════════════════════════════════════════════════

-- revoke select on public.momentos, public.vibes, public.vibe_comments,
--                  public.vibe_groups, public.vibe_reactions, public.circles,
--                  public.daily_responses_feed, public.dq_comments_feed,
--                  public.momento_comments_feed, public.bitacora_comments_full,
--                  public.reviews, public.guardian_presence,
--                  public.bitacora_reactions, public.bitacora_comment_reactions,
--                  public.dq_reactions, public.news_reactions,
--                  public.quote_reactions, public.bottle_reactions
--   from anon;

--  MARCHA ATRÁS, si hiciera falta (cambiar `revoke`/`from` por `grant`/`to`):
--  grant select on public.momentos, public.vibes, ... to anon;
