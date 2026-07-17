-- Seguridad broadcasts: cualquier usuario autenticado podía insertar un broadcast
-- con sender 'Velo — Administración' y mandárselo a otro (phishing de autoridad:
-- "tu cuenta fue sancionada, hacé clic acá", etc.). En la app ese sender de
-- autoridad se usa SOLO en funciones de admin (_adminProDelete y afines).
--
-- Mitigación quirúrgica y sin romper nada: una política RESTRICTIVE que impide a
-- los usuarios NO admin insertar broadcasts cuyo sender se haga pasar por la
-- Administración. Las RESTRICTIVE se combinan con AND, así que solo AGREGA un
-- gate a los INSERT existentes (no habilita RLS ni otorga acceso nuevo). El admin
-- (por email del JWT) queda exento; el service_role opera fuera de RLS.
--
-- Nota: esto cierra el vector de impersonación de AUTORIDAD (el más peligroso).
-- Los senders comunitarios legítimos ('Velo — Comunidad', nombres propios) no se
-- tocan. Un endurecimiento total del spoofing de sender requeriría rediseño
-- (columna from_id + no confiar en el sender para mostrar autoridad).

drop policy if exists "broadcasts_no_admin_impersonation" on public.broadcasts;
create policy "broadcasts_no_admin_impersonation"
  on public.broadcasts
  as restrictive
  for insert
  to public
  with check (
    position('Administraci' in coalesce(sender, '')) = 0
    or public.velo_is_admin()
  );
