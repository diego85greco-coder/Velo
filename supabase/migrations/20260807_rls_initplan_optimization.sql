-- ============================================================================
-- RENDIMIENTO DE LAS POLICIES: evaluar auth.uid() UNA VEZ, no por fila
-- (07/08/2026) — APLICADA en prod, con una reversión parcial. Leer entera.
--
-- QUÉ SE OPTIMIZÓ
-- 113 policies llamaban a auth.uid() / auth.jwt() directamente. Postgres las
-- re-evalúa POR CADA FILA examinada. Envueltas en un subselect
-- —(select auth.uid())— el planificador las calcula una sola vez (InitPlan).
-- Es el aviso `auth_rls_initplan` del analizador de Supabase.
--
-- Semánticamente es idéntico: auth.uid() es STABLE dentro de una consulta.
-- Postgres guarda la forma optimizada como `( SELECT auth.uid() AS uid)`.
--
-- ⚠️ LO QUE SALIÓ MAL, Y LA REGLA QUE SE APRENDIÓ
-- La optimización es inocua en 110 de las 113. En las otras 3 NO:
--
--     help_posts.help_posts_daily_limit
--     guardian_requests.guardian_requests_daily_limit
--     ia_usage.ia_usage_daily_limit
--
-- Son los topes diarios del plan gratuito y su condición hace una subconsulta
-- SOBRE SU PROPIA TABLA («¿cuántas filas mías hay en las últimas 24 h?»). Esa
-- subconsulta dispara, a su vez, la policy de SELECT de la misma tabla. Al
-- envolver auth.uid() en un subselect, Postgres deja de poder aplanar la
-- cadena y aborta:
--
--     ERROR 42P17: infinite recursion detected in policy for relation "help_posts"
--
-- Impacto real mientras estuvo mal: **publicar en la Sala de Ayuda fallaba**,
-- igual que pedir un guardián y registrar un uso de IA desde el cliente.
--
-- Revertir sólo la policy del tope NO alcanzó: como la subconsulta dispara
-- también la de SELECT, hay que dejar planas TODAS las policies de esas tablas.
-- Se restauraron las tres tablas completas desde la copia previa.
--
-- REGLA: antes de tocar policies en masa, excluir las tablas cuya condición
-- consulte su propia tabla:
--
--     select distinct tablename from pg_policies
--      where coalesce(qual,'')||coalesce(with_check,'') like '%FROM '||tablename||' %';
--
-- Coste de dejarlas planas: irrelevante. Son tres tablas chicas y la operación
-- crítica es un INSERT de una fila, que es justo donde este aviso no importa.
--
-- ESTADO FINAL VERIFICADO
--   * 174 policies intactas · 0 desaparecidas · 0 cambiaron de comando, roles
--     ni carácter (comparado contra la copia previa).
--   * 110 optimizadas, 3 revertidas a propósito, 61 no la necesitaban.
--   * Usuario normal: 0 filas ajenas en las 12 comprobaciones (anónimos de las
--     tres secciones, reportes de crisis, consentimientos, quién reportó a
--     quién, historial del Muro, donaciones, plus_grants).
--   * Los feeds siguen completos (22 / 3) y el directorio de guardianes (14).
--   * Las 10 escrituras propias pasan.
--   * Los 7 ataques dan 0 filas.
--   * Moderación sigue viendo todo.
-- ============================================================================

-- Copia de seguridad previa (imprescindible: es lo que permitió revertir).
drop table if exists public._policy_backup_20260807;
create table public._policy_backup_20260807 as
select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
  from pg_policies where schemaname='public';

-- ── Paso 1: optimizar todas las que la necesitan ────────────────────────────
do $$
declare
  r record; v_qual text; v_check text; v_sql text; v_roles text;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
     where schemaname='public'
       and ( qual like '%auth.uid()%' or with_check like '%auth.uid()%'
          or qual like '%auth.jwt()%' or with_check like '%auth.jwt()%' )
       -- Excluir de entrada las tablas con policies auto-referentes (ver arriba)
       and tablename not in ('help_posts','guardian_requests','ia_usage')
  loop
    v_qual  := r.qual;
    v_check := r.with_check;
    if v_qual is not null then
      v_qual := replace(v_qual, 'auth.uid()', '(select auth.uid())');
      v_qual := replace(v_qual, 'auth.jwt()', '(select auth.jwt())');
    end if;
    if v_check is not null then
      v_check := replace(v_check, 'auth.uid()', '(select auth.uid())');
      v_check := replace(v_check, 'auth.jwt()', '(select auth.jwt())');
    end if;

    select string_agg(quote_ident(x::text), ', ') into v_roles from unnest(r.roles) x;

    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
                    r.policyname, r.schemaname, r.tablename,
                    case when r.permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
                    case r.cmd when 'ALL' then 'all' else lower(r.cmd) end,
                    v_roles);
    if v_qual  is not null then v_sql := v_sql || ' using ('      || v_qual  || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end $$;

-- ── Paso 2: comprobación ────────────────────────────────────────────────────
-- Que ninguna de las 3 tablas excluidas haya quedado con un subselect:
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname='public' and tablename in ('help_posts','guardian_requests','ia_usage')
     and (coalesce(qual,'')||coalesce(with_check,'')) like '%SELECT auth.%';
  if n > 0 then
    raise exception 'Las tablas auto-referentes quedaron optimizadas: recursión asegurada (%)', n;
  end if;
end $$;
