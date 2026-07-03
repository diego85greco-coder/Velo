# send-dm-push

Web Push notification cuando llega un DM nuevo. Se dispara desde el
Database Webhook (o un trigger PL/pgSQL) de la tabla `direct_messages`.

## Deploy (una sola vez)

```bash
# 1) Setear secrets (usá las mismas VAPID keys que ya usa el workflow diario)
supabase secrets set \
  VAPID_PUBLIC_KEY="<tu VAPID_PUBLIC_KEY>" \
  VAPID_PRIVATE_KEY="<tu VAPID_PRIVATE_KEY>" \
  VAPID_SUBJECT="mailto:hey@heyvelo.app"

# 2) Deploy de la function
supabase functions deploy send-dm-push --no-verify-jwt
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente.

## Habilitar el trigger (dos opciones — elegí UNA)

### Opción A — Database Webhook via UI (recomendado)

Supabase Studio → **Database → Webhooks → Create a new hook**:

- **Name**: `dm_push_notify`
- **Table**: `direct_messages`
- **Events**: `Insert`
- **Type**: Supabase Edge Functions
- **Edge Function**: `send-dm-push`
- **HTTP Method**: POST
- **Timeout**: 5000 ms

Guardar. A partir de acá, cada INSERT dispara el webhook y la function
manda el push.

### Opción B — Trigger PL/pgSQL

Si preferís que el trigger corra en Postgres (útil para replicar en
staging vía SQL):

```sql
-- Requiere las extensiones http y pg_net (o net.http_post):
create extension if not exists pg_net;

-- Guardá la URL y la anon key en config:
alter database postgres set app.dm_push_fn_url    = 'https://<PROJECT-REF>.functions.supabase.co/send-dm-push';
alter database postgres set app.dm_push_fn_secret = '<TU_ANON_KEY_O_UN_SECRET_INTERNO>';

create or replace function public.trigger_send_dm_push()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := current_setting('app.dm_push_fn_url', true),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer '||current_setting('app.dm_push_fn_secret', true)
               ),
    body    := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

drop trigger if exists dm_push_notify on public.direct_messages;
create trigger dm_push_notify
after insert on public.direct_messages
for each row execute function public.trigger_send_dm_push();
```

## Verificación

Después del deploy podés testear a mano:

```bash
curl -sX POST "https://<PROJECT-REF>.functions.supabase.co/send-dm-push" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -d '{"record":{"from_id":"<UID_A>","from_name":"Test","to_id":"<UID_B>","text":"hola desde curl"}}'
```

Si el UID_B tiene push subscription en `profiles.push_subscription`,
te va a llegar la notificación en el dispositivo con la PWA instalada.
