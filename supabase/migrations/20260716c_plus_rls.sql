-- Enforcement server-side de Velo Plus para la creación de GRUPOS PRIVADOS de Vibes.
-- Verdad: profiles.role='plus' vigente (lo setean los webhooks de pago).
--
-- Se usa una política RESTRICTIVE: se COMBINA (AND) con las políticas de INSERT
-- que ya tengas, agregando SOLO la condición "los grupos privados requieren Plus".
-- No reemplaza ni afecta la creación de grupos públicos/oficiales.

-- 1) Función de verdad — generosa para no cortar Plus legítimo:
--    Plus vigente (expiry futuro o nulo = grant/admin/legacy).
create or replace function public.velo_is_premium(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.role = 'plus'
      and (p.plus_expires_at is null or p.plus_expires_at > now())
  );
$$;

-- 2) Política RESTRICTIVE sobre vibe_groups: un grupo 'private' solo se puede
--    crear si quien lo crea es Plus. Todo lo demás (public/official) sin cambios.
drop policy if exists "vibe_groups_private_needs_plus" on public.vibe_groups;
create policy "vibe_groups_private_needs_plus"
  on public.vibe_groups
  as restrictive
  for insert
  to authenticated
  with check ( kind <> 'private' or public.velo_is_premium(auth.uid()) );
