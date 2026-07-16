-- Limpieza automática de ia_usage: solo importan las últimas 24 h para el límite,
-- así que borramos lo más viejo que 48 h. Corre solo, cada noche, con pg_cron.
-- (Si pg_cron no estuviera disponible, ver la variante manual al pie.)

create extension if not exists pg_cron;

-- Función de limpieza — segura de correr a mano también.
create or replace function public.velo_cleanup_ia_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ia_usage where created_at < now() - interval '48 hours';
$$;

-- Programar todas las noches a las 04:00 UTC (~01:00 Argentina). Evita duplicar
-- el job si ya existe.
select cron.unschedule('velo_cleanup_ia_usage')
where exists (select 1 from cron.job where jobname = 'velo_cleanup_ia_usage');

select cron.schedule('velo_cleanup_ia_usage', '0 4 * * *',
  $$ select public.velo_cleanup_ia_usage(); $$);

-- ── Variante manual (si preferís no usar pg_cron): corré esto cuando quieras ──
-- delete from public.ia_usage where created_at < now() - interval '48 hours';
