-- Lo que Supabase pone y un PostgreSQL recién instalado no.
--
-- La prueba de restauración levanta un PostgreSQL vacío y le aplica
-- `supabase/schema.sql`. Ese volcado da por hechas cuatro cosas que existen en
-- Supabase y en ningún otro sitio, y que se comprobaron una por una contra la
-- base de producción (son exactamente éstas, ni una más):
--
--   auth.uid()        — el id de quien consulta, sacado del JWT
--   auth.jwt()        — el JWT entero
--   auth.users        — la tabla de cuentas, a la que apuntan 5 claves ajenas
--   net.http_post()   — pg_net, que usa el trigger de avisos de mensajes
--
-- Y tres roles: anon, authenticated y service_role.
--
-- Esto NO es parte del respaldo: es el andamio para poder probarlo. En una
-- restauración de verdad sobre un proyecto nuevo de Supabase, todo esto ya
-- está y este archivo no se usa.

-- ── Roles ───────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin bypassrls; end if;
end $$;

create extension if not exists pgcrypto;

-- ── El esquema auth ─────────────────────────────────────────────────────────
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
);

-- Mismos stubs que usa Supabase: leen la configuración de la sesión, que es lo
-- que PostgREST rellena en cada petición.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;

-- ── pg_net ──────────────────────────────────────────────────────────────────
-- El trigger de avisos de mensajes directos llama a net.http_post. Acá no
-- queremos que salga ninguna petición de verdad: devuelve un id y no hace nada.
create schema if not exists net;
create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 0::bigint $$;

grant usage on schema public, auth, net to anon, authenticated, service_role;
