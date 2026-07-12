-- push_history: guarda las notificaciones diarias ya enviadas (por slot) para que
-- el generador NO repita el mismo mensaje día a día. Opcional: si no existe, el
-- envío igual funciona (rota los fallbacks). Solo la escribe/lee el service role
-- desde la GitHub Action send-push.js.
create table if not exists public.push_history (
  id        bigint generated always as identity primary key,
  slot      text not null,                    -- 'morning' | 'afternoon' | 'night'
  title     text,
  body      text,
  sent_at   timestamptz not null default now()
);

create index if not exists push_history_slot_sent_idx
  on public.push_history (slot, sent_at desc);

-- Solo el service role la usa; RLS activada sin políticas públicas = nadie más entra.
alter table public.push_history enable row level security;
