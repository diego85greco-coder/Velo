# Vibes — Migraciones Supabase (orden de aplicación)

Correr **EN ESTE ORDEN** en Studio → SQL Editor:

## 1. `20260703_vibes_schema.sql`
Crea las 3 tablas `vibe_groups`, `vibes`, `vibe_reactions`, sus RLS,
índices, y **seedea los 7 grupos oficiales de Velo**:

- Momentos de felicidad 🌞
- Nuestras mascotas 🐾
- Momentos de lectura 📖
- Momentos de ejercicio 💪
- Momentos de entretenimiento 🎭
- Momentos de conciertos 🎵
- Nuestras comidas preferidas 🍽️

## 2. `20260703b_vibes_instant_plus_storage.sql`
Extiende `vibes` para soportar **momentos instantáneos** (sin grupo)
públicos o privados, actualiza las policies RLS, y crea el **bucket
Storage `vibes`** con sus policies (read público / write-delete solo
en `<user_id>/`).

> El bloque de Storage es defensivo: si por algún motivo el schema
> `storage` no existe en tu proyecto, no rompe.

## Verificación rápida

Después de correr las dos:

```sql
select kind, count(*) from public.vibe_groups group by 1;
-- esperado: official = 7

select id, name, public from storage.buckets where id = 'vibes';
-- esperado: 1 fila, public = true
```

## Rollback (si querés desarmar todo)

```sql
drop table if exists public.vibe_reactions cascade;
drop table if exists public.vibes cascade;
drop table if exists public.vibe_groups cascade;
-- El bucket lo dejamos manual — borralo desde Studio si querés.
```
