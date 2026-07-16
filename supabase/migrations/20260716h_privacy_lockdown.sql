-- CRÍTICO (privacidad): cerrar la lectura ABIERTA de datos íntimos.
-- Problema: quedaron vivas políticas permisivas viejas con USING(true) sobre
-- diary_entries, mood_entries y direct_messages. Como en Postgres las políticas
-- permisivas se combinan con OR, cualquier usuario (o anónimo) podía leer el
-- diario, las notas de ánimo y los chats privados de TODOS.
--
-- Solución: dropear las permisivas y dejar acceso SOLO al dueño / participante.
-- El admin (por email del JWT) conserva lectura para sus analíticas.

-- Helper: ¿el que consulta es admin? (por email del JWT).
create or replace function public.velo_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') in
         ('consultas@heyvelo.app', 'wearevelo.app@gmail.com');
$$;

-- ── DIARIO ÍNTIMO ────────────────────────────────────────────────────
drop policy if exists "diary_select"      on public.diary_entries;
drop policy if exists "allow_all"          on public.diary_entries;
drop policy if exists "diary_select_own"   on public.diary_entries;
drop policy if exists "diary_rw_own"       on public.diary_entries;
create policy "diary_select_own" on public.diary_entries
  for select to authenticated
  using ( user_id::text = auth.uid()::text or public.velo_is_admin() );
create policy "diary_insert_own" on public.diary_entries
  for insert to authenticated with check ( user_id::text = auth.uid()::text );
create policy "diary_update_own" on public.diary_entries
  for update to authenticated using ( user_id::text = auth.uid()::text );
create policy "diary_delete_own" on public.diary_entries
  for delete to authenticated using ( user_id::text = auth.uid()::text );

-- ── ÁNIMOS ───────────────────────────────────────────────────────────
drop policy if exists "mood_select"      on public.mood_entries;
drop policy if exists "allow_all"         on public.mood_entries;
drop policy if exists "mood_select_own"   on public.mood_entries;
drop policy if exists "mood_rw_own"       on public.mood_entries;
create policy "mood_select_own" on public.mood_entries
  for select to authenticated
  using ( user_id::text = auth.uid()::text or public.velo_is_admin() );
create policy "mood_insert_own" on public.mood_entries
  for insert to authenticated with check ( user_id::text = auth.uid()::text );
create policy "mood_update_own" on public.mood_entries
  for update to authenticated using ( user_id::text = auth.uid()::text );
create policy "mood_delete_own" on public.mood_entries
  for delete to authenticated using ( user_id::text = auth.uid()::text );

-- ── MENSAJES DIRECTOS ────────────────────────────────────────────────
-- dm_all abría TODAS las operaciones. Lo dropeamos y dejamos acceso solo al par.
drop policy if exists "dm_all"                on public.direct_messages;
drop policy if exists "dm_select_participant" on public.direct_messages;
drop policy if exists "dm_insert_own"         on public.direct_messages;
drop policy if exists "dm_update_participant" on public.direct_messages;
drop policy if exists "dm_delete_participant" on public.direct_messages;
create policy "dm_select_participant" on public.direct_messages
  for select to authenticated
  using ( from_id::text = auth.uid()::text or to_id::text = auth.uid()::text );
create policy "dm_insert_own" on public.direct_messages
  for insert to authenticated
  with check ( from_id::text = auth.uid()::text );
create policy "dm_update_participant" on public.direct_messages
  for update to authenticated
  using ( from_id::text = auth.uid()::text or to_id::text = auth.uid()::text );
create policy "dm_delete_participant" on public.direct_messages
  for delete to authenticated
  using ( from_id::text = auth.uid()::text or to_id::text = auth.uid()::text );
