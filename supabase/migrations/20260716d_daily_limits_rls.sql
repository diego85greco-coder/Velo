-- Enforcement server-side de los LÍMITES DIARIOS del plan gratuito.
-- El cliente ya corta y muestra "suscribite a Plus" al llegar al tope; esto es
-- el backstop en la base para que ni editando la consola se pueda saltear.
--
-- Ventana: 24 horas móviles (simple y a prueba de zona horaria). Plus = ilimitado
-- (usa velo_is_premium de la migración anterior). Políticas RESTRICTIVE → se
-- SUMAN (AND) a las que ya tenés, sin tocar nada más.
--
-- Cupos gratis: Sala de Ayuda 4/día · Pedir Guardián 4/día.

-- Sala de Ayuda — máx 4 publicaciones propias por 24 h (salvo Plus).
drop policy if exists "help_posts_daily_limit" on public.help_posts;
create policy "help_posts_daily_limit"
  on public.help_posts
  as restrictive
  for insert
  to authenticated
  with check (
    public.velo_is_premium(auth.uid()::text)
    or (
      select count(*) from public.help_posts h
      where h.user_id = auth.uid()::text
        and h.created_at > now() - interval '24 hours'
    ) < 4
  );

-- Guardianes — máx 4 pedidos de acompañamiento propios (como seeker) por 24 h.
-- Cuenta solo por seeker_id, así NO afecta a los guardianes que OFRECEN ayuda
-- (esos insertan con seeker_id de otra persona).
drop policy if exists "guardian_requests_daily_limit" on public.guardian_requests;
create policy "guardian_requests_daily_limit"
  on public.guardian_requests
  as restrictive
  for insert
  to authenticated
  with check (
    public.velo_is_premium(auth.uid()::text)
    -- Si la fila NO es un pedido MÍO (soy el guardián que OFRECE ayuda,
    -- seeker_id es de otra persona) → no aplica el límite (ofrecer es ilimitado).
    or seeker_id is distinct from auth.uid()::text
    -- Es mi propio pedido → limitar a 4 en 24 h.
    or (
      select count(*) from public.guardian_requests g
      where g.seeker_id = auth.uid()::text
        and g.created_at > now() - interval '24 hours'
    ) < 4
  );
