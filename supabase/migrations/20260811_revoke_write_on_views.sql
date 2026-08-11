-- ============================================================================
-- LAS VISTAS PERMITÍAN ESCRIBIR SALTEANDO RLS  (detectado 11/08/2026)
--
-- Las vistas de `public` tenían concedido INSERT/UPDATE/DELETE a `anon` y a
-- `authenticated`. Varias son auto-actualizables (Postgres las reescribe contra
-- la tabla base). Como pertenecen a `postgres` y las tablas base **no** tienen
-- FORCE ROW LEVEL SECURITY, la escritura se ejecuta con los privilegios del
-- dueño: las políticas RLS no se evalúan.
--
-- Comprobado contra producción, como `anon`, con rollback (no se borró nada):
--
--   delete from public.help_posts_feed       → habría borrado 22 filas
--   delete from public.happy_posts_full      → habría borrado 10 filas
--   delete from public.daily_responses_feed  → habría borrado 23 filas
--   delete from public.momento_comments_feed → habría borrado  7 filas
--   delete from public.dq_comments_feed      → habría borrado  4 filas
--
-- Es decir: con la clave pública —que está en el repositorio, que es público— y
-- sin ninguna cuenta, se podía vaciar la Sala de Ayuda y el Muro con una sola
-- petición HTTP. `profiles_full` da 0 porque su propio WHERE filtra por
-- auth.uid(), pero el INSERT sí la atravesaba (el WHERE de una vista no se
-- aplica a los INSERT si no tiene WITH CHECK OPTION).
--
-- AUDITORÍA PREVIA (la regla de este proyecto: no cerrar un permiso sin saber
-- quién lo usa). `premium.js` sólo hace `.select()` sobre las vistas — las
-- siete que existen. Todas las escrituras van contra las tablas base, donde
-- RLS sí se aplica. Revocar la escritura sobre las vistas no toca al cliente.
--
-- NO se cambia `security_invoker`: las vistas corren como dueño a propósito
-- (es lo que permite enmascarar las publicaciones anónimas ajenas). Tocarlo
-- rompería las lecturas.
-- ============================================================================

do $$
declare v record;
begin
  for v in
    select table_name from information_schema.views where table_schema = 'public'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated, public',
      v.table_name);
  end loop;
end $$;

-- ── VERIFICACIÓN ───────────────────────────────────────────────────────────
-- No debe devolver ninguna fila:
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema='public' and grantee in ('anon','authenticated')
--     and privilege_type in ('INSERT','UPDATE','DELETE')
--     and table_name in (select table_name from information_schema.views
--                        where table_schema='public');
