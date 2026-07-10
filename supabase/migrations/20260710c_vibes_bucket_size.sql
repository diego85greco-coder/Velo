-- v1427: límite de tamaño del bucket 'vibes' a 50 MB (tope del plan gratuito de
-- Supabase, que no permite subir el límite global sin pagar). La app valida 48 MB
-- antes de subir para dejar margen. 50 MB = 52428800 bytes.
update storage.buckets
set file_size_limit = 52428800
where id = 'vibes';
