-- ============================================================================
-- ✅ APLICADA el 11/08/2026 y verificada contra producción.
--    Se aplicó antes que 20260811f, que da por hecho que pro_patient_notes existe.
--
-- DOS TABLAS QUE EL CLIENTE USA Y QUE NUNCA SE CREARON  (detectado 11/08/2026)
--
-- Comprobado contra producción:
--   GET /rest/v1/pro_patient_notes    → PGRST205, «Could not find the table»
--   GET /rest/v1/solidarity_requests  → PGRST205, «Could not find the table»
--
-- Así que estas dos cosas nunca funcionaron:
--
-- 1. «VELA POR TI» — las solicitudes de sesión solidaria.
--    `pSendVela` (premium.js) hace `insert` en `solidarity_requests`, dentro de
--    un `try/catch` que se traga el error, y a continuación muestra:
--        «Solicitud enviada. Te contactaremos en 7-14 días 💚»
--    No se guardaba nada. La persona —alguien que pide terapia que no puede
--    pagar— se queda esperando una respuesta que nadie va a poder dar, porque
--    el panel de administración lee esa misma tabla y siempre la ve vacía.
--
-- 2. NOTAS DE PACIENTE de los profesionales. `_syncPatientNotesToSb` sube las
--    notas a `pro_patient_notes` en cada cambio. Fallaba siempre: las notas
--    viven sólo en el navegador y se pierden al limpiar el almacenamiento o al
--    cambiar de dispositivo. Ojo: hoy el cliente **sólo escribe**, nunca lee de
--    vuelta; esta tabla es un respaldo, no la fuente de verdad.
--
-- Cómo se detectó: el backup nocturno pasó a descubrir las tablas del esquema
-- de PostgREST en vez de una lista a mano, y avisó de que estas dos «ya no
-- existen». Nunca existieron.
--
-- Las columnas salen de lo que el cliente escribe y lee, no de suposiciones:
--   solidarity_requests → insert de premium.js:18485 y select de :29746
--   pro_patient_notes   → upsert de premium.js:28953, onConflict pro_id,patient_id
-- ============================================================================

-- ── «Vela por ti»: solicitudes de sesión solidaria ─────────────────────────
create table if not exists public.solidarity_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     text,                    -- puede ser null: se permite pedir sin cuenta
  email       text,
  user_name   text,
  tipo        text,
  espec       text,
  urgencia    text,
  horarios    text,
  description text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

alter table public.solidarity_requests enable row level security;

-- Cada quien puede crear la suya. `user_id` null se acepta porque el formulario
-- se puede enviar sin haber iniciado sesión.
drop policy if exists sr_insert_own on public.solidarity_requests;
create policy sr_insert_own on public.solidarity_requests
  for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid())::text);

-- Contiene el correo y el motivo por el que alguien pide ayuda que no puede
-- pagar. Sólo lo ve quien administra, y la propia persona.
drop policy if exists sr_select_admin_or_own on public.solidarity_requests;
create policy sr_select_admin_or_own on public.solidarity_requests
  for select to authenticated
  using (public.velo_is_admin() or user_id = (select auth.uid())::text);

drop policy if exists sr_update_admin on public.solidarity_requests;
create policy sr_update_admin on public.solidarity_requests
  for update to authenticated using (public.velo_is_admin()) with check (public.velo_is_admin());

drop policy if exists sr_delete_admin on public.solidarity_requests;
create policy sr_delete_admin on public.solidarity_requests
  for delete to authenticated using (public.velo_is_admin());

create index if not exists solidarity_requests_created_idx on public.solidarity_requests (created_at desc);
create index if not exists solidarity_requests_user_idx    on public.solidarity_requests (user_id);

grant select, insert, update, delete on public.solidarity_requests to authenticated;
revoke all on public.solidarity_requests from anon;

-- ── Notas de paciente (sólo del profesional que las escribe) ───────────────
create table if not exists public.pro_patient_notes (
  pro_id     text not null,
  patient_id text not null,
  notes      text,
  updated_at timestamptz not null default now(),
  primary key (pro_id, patient_id)
);

alter table public.pro_patient_notes enable row level security;

-- Son datos de salud. Las ve y las escribe SOLO el profesional que las hizo:
-- ni el paciente ni quien administra. No se añade excepción para admin a
-- propósito — nadie necesita leer la nota clínica de otra persona.
drop policy if exists ppn_all_own on public.pro_patient_notes;
create policy ppn_all_own on public.pro_patient_notes
  for all to authenticated
  using (pro_id = (select auth.uid())::text)
  with check (pro_id = (select auth.uid())::text);

create index if not exists pro_patient_notes_patient_idx on public.pro_patient_notes (patient_id);

grant select, insert, update, delete on public.pro_patient_notes to authenticated;
revoke all on public.pro_patient_notes from anon;

-- ── VERIFICACIÓN (tras aplicar) ────────────────────────────────────────────
-- Sin cuenta, las dos deben dar 401 en vez de PGRST205:
--   curl -s "$SUPA/rest/v1/solidarity_requests?select=id" -H "apikey: $ANON"
--   curl -s "$SUPA/rest/v1/pro_patient_notes?select=pro_id" -H "apikey: $ANON"
--
-- Y con sesión, enviar una solicitud desde «Vela por ti» y comprobar que
-- aparece en el panel de administración. Es la comprobación que importa: que
-- el aviso de «te contactaremos» deje de ser mentira.
