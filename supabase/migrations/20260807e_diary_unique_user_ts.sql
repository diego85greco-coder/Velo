-- ============================================================================
-- LA COLA DE SINCRONIZACIÓN DEL DIARIO NUNCA FUNCIONÓ (07/08) — APLICADA
--
-- `_retryDiarySync` reintenta las entradas del diario que no se pudieron
-- guardar en su momento (sin conexión, o sin sesión lista):
--     .upsert(row, { onConflict: 'user_id,ts', ignoreDuplicates: true })
--
-- Pero en `diary_entries` la ÚNICA clave única era `id`. Sin una sobre
-- (user_id, ts), Postgres rechaza la operación entera:
--     ERROR 42P10: there is no unique or exclusion constraint matching the
--                  ON CONFLICT specification
--
-- El código mete la entrada de vuelta en la cola al fallar, así que la cola
-- NUNCA se vaciaba: reintentaba lo mismo para siempre, fallando siempre.
--
-- CONSECUENCIA REAL: una entrada escrita sin conexión —o mientras la sesión se
-- renovaba— se quedaba sólo en el navegador. Si la persona cambia de
-- dispositivo o limpia el navegador, **se pierde**. Es la función más íntima de
-- la app y la única cuyo contenido no está en ningún otro lado.
--
-- Comprobado antes de crear el índice: 0 pares (user_id, ts) duplicados, 0 ts
-- nulos. El guardado normal usa INSERT y nunca tuvo este problema — sólo
-- fallaba el camino de reintento, que existe justamente para no perder nada.
-- ============================================================================

create unique index if not exists diary_entries_user_ts_uidx
  on public.diary_entries (user_id, ts);
