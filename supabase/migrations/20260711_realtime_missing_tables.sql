-- v1450: habilitar replicación Realtime para las tablas que la app SÍ suscribe
-- vía postgres_changes pero que NO estaban en la publicación supabase_realtime.
-- Sin esto, estas secciones NO se actualizan en tiempo real (el evento nunca
-- dispara; solo aparecen los cambios al refrescar / cambiar de sección):
--   • daily_responses  → feed de "Pregunta del día" (nuevas respuestas)
--   • dq_reactions     → reacciones a respuestas de la pregunta del día
--   • bitacora_posts   → nuevos posts en Bitácora (solo estaba bitacora_reactions)
--   • circle_members   → altas/bajas de miembros en Círculos de paz
-- Idempotente: si la tabla ya está en la publicación, no hace nada.
do $$
begin
  begin
    alter publication supabase_realtime add table public.daily_responses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dq_reactions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.bitacora_posts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.circle_members;
  exception when duplicate_object then null;
  end;
end $$;
