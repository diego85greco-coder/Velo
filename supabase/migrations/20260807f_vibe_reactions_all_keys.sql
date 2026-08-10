-- ============================================================================
-- 16 DE LAS 24 REACCIONES DE VIBES NO FUNCIONABAN (07/08) — APLICADA
--
-- `vibe_reactions` tiene una restricción CHECK con las reacciones permitidas.
-- Se creó con las 8 originales. En v1572 el cliente añadió 16 más —las del
-- botón ＋— pero **nadie actualizó la restricción**.
--
-- Elegir cualquiera de esas 16 devolvía
--     ERROR 23514: violates check constraint "vibe_reactions_reaction_check"
-- y, como la llamada está en un try/catch mudo, la reacción simplemente no
-- pasaba. La persona tocaba ＋, elegía «Un abrazo grande», y no ocurría nada.
--
-- ⚠️ La lista vive en DOS sitios: acá y en `VIBE_REACTIONS` (premium.js:21508).
-- Si se añaden más, hay que actualizar los dos.
--
-- (Comprobado de paso: `bottle_reactions` sí coincidía, 3 y 3.)
-- ============================================================================

alter table public.vibe_reactions drop constraint if exists vibe_reactions_reaction_check;
alter table public.vibe_reactions add constraint vibe_reactions_reaction_check
  check (reaction = any (array[
    'alegria','abrazo','acompano','fuerzas','gracias','me_hace_bien','animos','me_inspira',
    'abrazo_grande','conmovido','sanando','admiro','celebro','emociona','bronca','sonrisa',
    'pienso','aplausos','cruzo_dedos','uf','intenso','orgullo','con_vos'
  ]));
