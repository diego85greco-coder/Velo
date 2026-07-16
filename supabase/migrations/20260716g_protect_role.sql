-- CRÍTICO: impedir que un usuario se auto-otorgue Velo Plus.
-- Problema: el cliente podía escribir profiles.role='plus' en su propia fila
-- (la RLS profiles_update_own permite editar columnas propias), y como
-- velo_is_premium() lee ese role, TODAS las defensas RLS quedaban burladas.
--
-- Solución: un trigger BEFORE UPDATE que revierte cualquier cambio de `role`
-- salvo que lo haga:
--   • el service_role (webhooks de pago Stripe/PayPal → auth.uid() es NULL), o
--   • un admin (por email en el JWT).
-- Los edits normales de perfil (nombre, motto, avatar, estados) siguen intactos:
-- solo se protege la columna `role`.

create or replace function public.velo_protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    -- service_role (webhook): no hay usuario autenticado → permitido.
    if auth.uid() is null then
      return new;
    end if;
    -- admin (por email del JWT) → permitido (activar/cancelar Plus manual).
    if coalesce(auth.jwt() ->> 'email', '') in
       ('consultas@heyvelo.app', 'wearevelo.app@gmail.com') then
      return new;
    end if;
    -- cualquier otro (usuario común) → revertir el cambio de role.
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_velo_protect_role on public.profiles;
create trigger trg_velo_protect_role
  before update on public.profiles
  for each row
  execute function public.velo_protect_role();
