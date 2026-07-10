-- v1422: habilitar replicación Realtime para las vibes y sus reacciones.
-- Sin esto, el widget "Vibes de hoy" del home NO se actualiza en tiempo real
-- cuando alguien publica (el postgres_changes nunca dispara).
-- Idempotente: si la tabla ya está en la publicación, no hace nada.
do $$
begin
  begin
    alter publication supabase_realtime add table public.vibes;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.vibe_reactions;
  exception when duplicate_object then null;
  end;
end $$;
