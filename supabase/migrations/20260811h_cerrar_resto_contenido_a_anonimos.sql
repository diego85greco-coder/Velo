-- ============================================================================
-- ✅ APLICADA el 11/08/2026 y verificada en las dos direcciones.
--
-- CERRAR A LOS ANÓNIMOS EL RESTO DEL CONTENIDO
--
-- El 11/08 por la mañana se cerraron `help_posts_feed`, `bitacora_posts_full`,
-- `happy_posts_full` y `profiles`. Quedaban abiertas 18 cosas más: Momentos,
-- Vibes, Círculos, las respuestas a la pregunta del día, los feeds de
-- comentarios, las reseñas, la presencia de guardianes y las reacciones.
--
-- Se dejó para el final a propósito. Era el único cambio que, si salía mal, se
-- vería: esas secciones aparecerían vacías al arrancar en frío, porque las
-- lecturas tempranas salen como `anon` hasta que la sesión se restaura. Lo que
-- lo hizo seguro fue v1631: la espera de sesión se puso dentro de
-- `_veloLoudFetch` —el único punto por el que pasan TODAS las consultas de
-- supabase-js—, así que ya no hacía falta parchear ~100 puntos de lectura.
--
-- VERIFICADO ANTES Y DESPUÉS, simulando lo que hace PostgREST con cada rol
-- (`set local role` + `request.jwt.claims` con un usuario real):
--
--                          antes            después
--   sin sesión .........   los 18 legibles  los 18 BLOQUEADOS
--   con sesión .........   los 18 legibles  los 18 legibles, mismos recuentos
--
-- Y por HTTP con la clave pública del repositorio: 401 en todos.
--
-- Barrido final: como `anon`, no queda NINGUNA tabla ni vista de `public` que
-- devuelva una sola fila.
--
-- LO QUE SIGUE FUNCIONANDO SIN CUENTA, comprobado uno por uno porque tiene que
-- seguir así: el formulario de contacto de la web pública (`contacts`), el
-- registro anti-bot (`bot_attempts`) y la aceptación de términos al darse de
-- alta (`terms_acceptance`). Los tres insertan bien.
--
-- Recuentos tras el cambio: 22/10/3/15/17/5/11 (ayuda, muro, bitácora,
-- momentos, vibes, círculos, perfiles) — idénticos.
--
-- MARCHA ATRÁS, si alguna sección apareciera vacía:
--   grant select on public.momentos, public.vibes, ... to anon;
-- ============================================================================

revoke select on public.momentos, public.vibes, public.vibe_comments,
                 public.vibe_groups, public.vibe_reactions, public.circles,
                 public.daily_responses_feed, public.dq_comments_feed,
                 public.momento_comments_feed, public.bitacora_comments_full,
                 public.reviews, public.guardian_presence,
                 public.bitacora_reactions, public.bitacora_comment_reactions,
                 public.dq_reactions, public.news_reactions,
                 public.quote_reactions, public.bottle_reactions
  from anon;
