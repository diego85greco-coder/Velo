-- ============================================================================
-- MINIMIZACIÓN: dejar de conservar la marca de urgencia en help_posts  (2026-07-24)
--
-- `help_posts.urgencia` se rellenaba con 'urgente' cuando el detector de crisis
-- encontraba señales de ideación suicida o autolesión. En la práctica eso era un
-- registro permanente, asociado a la cuenta, de que esa persona atravesó una
-- crisis: dato de salud de máxima sensibilidad, sin plazo de borrado y sin una
-- finalidad que lo justifique una vez mostrado el pedido.
--
-- Decisión del responsable (24/07/2026, opción 2 del procedimiento de crisis):
-- NO persistirla. El triaje se recalcula en cada cliente al renderizar, a partir
-- del texto que la persona publicó igualmente. El orden en pantalla no cambia.
--
-- Esta migración BORRA el histórico ya almacenado. La columna se conserva —sin
-- datos— para no romper clientes viejos que aún la lean (devuelve NULL y el
-- cliente cae a 'normal'). Puede eliminarse del todo más adelante.
--
-- Idempotente.
-- ============================================================================

-- Borrar el histórico de marcas de crisis
update public.help_posts
   set urgencia = null
 where urgencia is not null;

-- Que no vuelva a rellenarse por defecto desde el servidor
alter table public.help_posts alter column urgencia drop default;

comment on column public.help_posts.urgencia is
  'OBSOLETA (24/07/2026). No debe escribirse: registraba señales de crisis de forma permanente. El triaje se calcula en el cliente desde el texto del pedido. Conservada temporalmente por compatibilidad; eliminar cuando ya no queden clientes antiguos.';
