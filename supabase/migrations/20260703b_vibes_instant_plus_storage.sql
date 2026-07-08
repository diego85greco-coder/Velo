-- Vibes v1315: momentos INSTANTÁNEOS (sin grupo) + bucket de Storage
--
-- Correr DESPUÉS de 20260703_vibes_schema.sql
--
-- Nota: profiles.id es text (no uuid), así que instant_member_ids es text[]
-- y las comparaciones con auth.uid() usan cast ::text.

begin;

-- ── 1. Momentos instantáneos ────────────────────────────────────
-- Historias que no pertenecen a ningún grupo. group_id pasa a NULLABLE.
-- Cada instant vibe lleva su propio scope (public/private) y opcionalmente
-- una lista de invitados.
alter table public.vibes
  alter column group_id drop not null,
  add column if not exists instant_scope text
    check (instant_scope in ('public','private')),
  add column if not exists instant_member_ids text[] default '{}';

-- Constraint: o pertenece a un grupo, o es instantáneo con scope
alter table public.vibes drop constraint if exists vibes_target_check;
alter table public.vibes add constraint vibes_target_check
  check (
    (group_id is not null and instant_scope is null)
    or
    (group_id is null and instant_scope is not null)
  );

-- Actualizar RLS de vibes para el caso instantáneo
drop policy if exists vibes_select on public.vibes;
create policy vibes_select on public.vibes
for select using (
  -- Vibe en grupo: podés verla si podés ver el grupo
  (vibes.group_id is not null and exists (
    select 1 from public.vibe_groups g
    where g.id = vibes.group_id
      and (
        g.kind in ('official','public')
        or auth.uid()::text = g.owner_id
        or auth.uid()::text = any(g.member_ids)
      )
  ))
  -- Vibe instantáneo público: cualquier authenticated user
  or (vibes.group_id is null and vibes.instant_scope = 'public')
  -- Vibe instantáneo privado: sólo el autor o los invitados
  or (vibes.group_id is null and vibes.instant_scope = 'private' and (
        auth.uid()::text = vibes.user_id
        or auth.uid()::text = any(vibes.instant_member_ids)
      ))
);

drop policy if exists vibes_insert on public.vibes;
create policy vibes_insert on public.vibes
for insert with check (
  auth.uid()::text = user_id
  and (
    -- Insert en grupo: podés postear si podés ver el grupo
    (group_id is not null and exists (
      select 1 from public.vibe_groups g
      where g.id = group_id
        and (
          g.kind in ('official','public')
          or auth.uid()::text = g.owner_id
          or auth.uid()::text = any(g.member_ids)
        )
    ))
    -- Insert instantáneo: OK siempre (el scope ya está en el check)
    or (group_id is null and instant_scope in ('public','private'))
  )
);


-- ── 2. Storage bucket para media ────────────────────────────────
-- Bucket público para 'vibes' (lo creamos vía API SQL o desde el dashboard).
-- Si el schema storage no existe (Studio local sin storage), este bloque se
-- puede saltar sin romper.

do $$ begin
  perform 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets';
  if found then
    insert into storage.buckets (id, name, public)
    values ('vibes','vibes', true)
    on conflict (id) do nothing;
  end if;
exception when others then null;
end $$;

-- Policies del bucket: read público, write authenticated (el path lleva user_id)
-- Formato del path esperado: <user_id>/<vibe_id_o_ts>.jpg
do $$ begin
  perform 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects';
  if found then
    -- Lectura pública para los objetos del bucket 'vibes'
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vibes_public_read') then
      execute $q$
        create policy vibes_public_read on storage.objects
        for select using (bucket_id = 'vibes')
      $q$;
    end if;
    -- Upload solo para authenticated y sólo en su carpeta
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vibes_owner_write') then
      execute $q$
        create policy vibes_owner_write on storage.objects
        for insert with check (
          bucket_id = 'vibes'
          and auth.role() = 'authenticated'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
      $q$;
    end if;
    -- Delete sólo para el owner de la carpeta
    if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='vibes_owner_delete') then
      execute $q$
        create policy vibes_owner_delete on storage.objects
        for delete using (
          bucket_id = 'vibes'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
      $q$;
    end if;
  end if;
exception when others then null;
end $$;

commit;
