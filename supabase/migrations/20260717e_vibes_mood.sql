-- Emoción como protagonista de las historias (Vibes): columna opcional 'mood'
-- con el emoji del ánimo con que se compartió el momento (😌, 😔, 💪, etc.).
-- Se lee con el select('*') existente y se escribe en el insert del autor, así
-- que no hacen falta cambios de RLS.

alter table public.vibes add column if not exists mood text;
