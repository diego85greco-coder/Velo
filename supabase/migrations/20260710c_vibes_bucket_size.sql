-- v1425: subir el límite de tamaño del bucket 'vibes' a 150 MB para permitir
-- videos de hasta 60 segundos (un 1080p de iPhone pesa 80-130 MB).
-- 150 MB = 157286400 bytes.
update storage.buckets
set file_size_limit = 157286400
where id = 'vibes';
