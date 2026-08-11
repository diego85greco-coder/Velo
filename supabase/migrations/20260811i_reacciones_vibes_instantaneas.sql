-- ============================================================================
-- ✅ APLICADA el 11/08/2026 desde el editor SQL (el conector MCP estaba caído).
--    Confirmada: `pg_policies` ya no muestra el join contra `vibe_groups`.
--
-- LAS REACCIONES A UNA VIBE INSTANTÁNEA NO SE VEÍAN NUNCA  (11/08/2026)
--
-- Al abrir «Quién te acompañó» en un momento, quien había reaccionado aparecía
-- en «pasaron a verla» y no en «te acompañaron», sin su emoji. La consulta a
-- `vibe_reactions` volvía vacía — no por un fallo del cliente, sino porque RLS
-- la filtraba entera.
--
-- CÓMO SE LLEGÓ ACÁ. Las vibes nacieron sólo dentro de grupos, así que todas
-- las políticas empezaban igual:
--
--     select 1 from public.vibes v
--     join public.vibe_groups g on g.id = v.group_id      ← INNER JOIN
--
-- Después se añadieron las vibes INSTANTÁNEAS, que no pertenecen a ningún
-- grupo: guardan `instant_scope` y dejan `group_id` en NULL. La migración
-- 20260703b actualizó `vibes_select` y `vibes_insert` para contemplarlas, y las
-- de comentarios nacieron ya contemplándolas. `vibe_reactions_select` fue la
-- única que se quedó atrás:
--
--     vibes_select                   ✓ contempla instantáneas
--     vibes_insert                   ✓
--     vibe_comments_select/insert    ✓
--     vibe_comment_reactions_select  ✓
--     vibe_reactions_select          ✗  ← ésta
--
-- Con `group_id` NULL ese INNER JOIN no devuelve ninguna fila, la condición es
-- falsa y las reacciones quedan invisibles para todo el mundo, incluido el
-- autor de la vibe. Resultado curioso: en un momento instantáneo se ven los
-- comentarios, e incluso las reacciones A los comentarios, pero no las
-- reacciones al momento.
--
-- EL ARREGLO, Y POR QUÉ ASÍ. Se podría copiar acá los tres casos de
-- `vibes_select` (grupo / instantánea pública / instantánea privada). No se
-- hace: duplicar esa lógica es exactamente lo que produjo el desajuste. En vez
-- de eso la política pregunta una sola cosa —«¿puedo ver la vibe?»— y deja que
-- RLS de `vibes` responda. Las políticas se aplican también dentro de las
-- subconsultas de otra política, así que la regla de visibilidad queda en un
-- único sitio y las reacciones la siguen sola si algún día cambia.
--
-- No hay recursión: `vibe_reactions` consulta `vibes`, y `vibes` consulta
-- `vibe_groups`. No se cierra el círculo.
--
-- ── PROBADA en un PostgreSQL 16 local con las tres tablas replicadas ───────
-- Se copió `vibes_select` tal cual está en producción y se contaron las
-- reacciones visibles en seis combinaciones de vibe × espectador:
--
--                                      vieja    nueva
--   vibe en grupo público · autora        1        1
--   instantánea pública   · autora        0 ←      1
--   instantánea pública   · ajena         0 ←      1
--   instantánea privada   · autora        0 ←      1
--   instantánea privada   · invitada      0 ←      1
--   instantánea privada   · AJENA         0        0    ← sigue oculta
--
-- Las cuatro filas marcadas son el fallo: ni siquiera la autora veía quién
-- había reaccionado a su propio momento.
--
-- Lo importante es la última fila: el arreglo NO abre nada. Quien no puede ver
-- la vibe sigue sin poder ver sus reacciones, porque la condición es
-- exactamente «¿puedo ver la vibe?».
-- ============================================================================

drop policy if exists vibe_reactions_select on public.vibe_reactions;
create policy vibe_reactions_select on public.vibe_reactions
for select using (
  exists (
    select 1 from public.vibes v
    where v.id = vibe_reactions.vibe_id
  )
);

-- ── VERIFICACIÓN (tras aplicar) ────────────────────────────────────────────
-- Con una sesión real, sobre una vibe instantánea que tenga reacciones:
--   select count(*) from public.vibe_reactions where vibe_id = '<id>';
--   → antes 0, después el número real.
--
-- Y que no se haya abierto de más: con la sesión de alguien que NO esté
-- invitado a una instantánea privada, esa misma consulta debe seguir dando 0.
