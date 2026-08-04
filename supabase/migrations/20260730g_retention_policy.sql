-- ============================================================================
-- PLAZOS DE CONSERVACIÓN APLICADOS AUTOMÁTICAMENTE  (2026-07-30) — APLICADA
--
-- El art. 5.1.e del RGPD exige no conservar los datos más tiempo del necesario.
-- La mayoría de los datos de Velo ya se ajustan solos (los momentos y el Muro
-- expiran a las 24 h; el contador de IA se limpia cada noche; el resto lo borra
-- la persona o su borrado de cuenta).
--
-- Faltaban TRES que no caducaban nunca. Se implementan acá, con los plazos
-- propuestos en LEGAL-brechas-y-conservacion.md. Están todos en un solo sitio
-- —la tabla `velo_retention_policy`— para poder cambiarlos con un UPDATE, sin
-- tocar código, cuando el responsable decida otra cosa.
--
-- Los tres empiezan DESACTIVADOS (`enabled = false`): borrar datos de gente es
-- irreversible y esa decisión es del responsable, no de una migración.
--     update public.velo_retention_policy set enabled = true where key = '...';
--
-- Mientras están desactivados, la función informa qué borraría sin borrarlo:
--     select * from public.velo_retention_report();
-- ============================================================================

create table if not exists public.velo_retention_policy (
  key         text primary key,
  days        integer not null,
  enabled     boolean not null default false,
  description text
);

insert into public.velo_retention_policy (key, days, enabled, description) values
  ('help_posts',      90,  false, 'Pedidos de la Sala de Ayuda ya cerrados. Cumplida su finalidad, no hay motivo para conservarlos.'),
  ('moderation_flags',365, false, 'Marcas de moderación ya resueltas. Se conservan un año por reincidencia y por las obligaciones del DSA.'),
  ('inactive_accounts',730,false, 'Cuentas sin actividad. NO borra nada por sí sola: sólo las señala para poder avisar por email antes.')
on conflict (key) do nothing;

alter table public.velo_retention_policy enable row level security;
drop policy if exists retention_policy_admin on public.velo_retention_policy;
create policy retention_policy_admin on public.velo_retention_policy
  for select to authenticated using ( public.velo_is_admin() );
revoke insert, update, delete on public.velo_retention_policy from anon, authenticated;

-- ── Informe: qué se borraría con los plazos actuales (no borra nada) ────────
create or replace function public.velo_retention_report()
returns table (politica text, dias integer, activa boolean, filas_afectadas bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.key, p.days, p.enabled,
    case p.key
      when 'help_posts' then
        (select count(*) from public.help_posts h
          where coalesce(h.closed,false) and h.created_at < now() - (p.days || ' days')::interval)
      when 'moderation_flags' then
        (select count(*) from public.moderation_flags m
          where coalesce(m.resolved,false) and m.created_at < now() - (p.days || ' days')::interval)
      when 'inactive_accounts' then
        (select count(*) from public.profiles pr
          where pr.created_at < now() - (p.days || ' days')::interval
            and not exists (select 1 from public.mood_entries me
                             where me.user_id = pr.id::uuid
                               and me.created_at > now() - (p.days || ' days')::interval))
      else 0::bigint
    end
  from public.velo_retention_policy p
  order by p.key;
end;
$$;
revoke execute on function public.velo_retention_report() from public, anon;
grant  execute on function public.velo_retention_report() to authenticated;

-- ── Aplicación: sólo actúa sobre las políticas marcadas como activas ────────
create or replace function public.velo_apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_help int := 0;
  v_mod  int := 0;
  v_days int;
begin
  select days into v_days from public.velo_retention_policy
   where key='help_posts' and enabled;
  if found then
    delete from public.help_posts
     where coalesce(closed,false) and created_at < now() - (v_days || ' days')::interval;
    get diagnostics v_help = row_count;
  end if;

  select days into v_days from public.velo_retention_policy
   where key='moderation_flags' and enabled;
  if found then
    delete from public.moderation_flags
     where coalesce(resolved,false) and created_at < now() - (v_days || ' days')::interval;
    get diagnostics v_mod = row_count;
  end if;

  -- `inactive_accounts` NO se aplica automáticamente a propósito: borrar la
  -- cuenta de alguien sin avisarle antes por email sería desproporcionado.
  -- El informe la señala; el aviso y el borrado son una decisión con revisión.

  return jsonb_build_object('help_posts_borrados', v_help,
                            'moderation_flags_borrados', v_mod,
                            'ejecutado', now());
end;
$$;
revoke execute on function public.velo_apply_retention() from public, anon, authenticated;

select cron.unschedule('velo_apply_retention')
where exists (select 1 from cron.job where jobname = 'velo_apply_retention');

select cron.schedule('velo_apply_retention', '30 4 * * *',
  $$ select public.velo_apply_retention(); $$);
