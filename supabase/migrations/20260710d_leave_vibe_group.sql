-- v1433: RPC para que un MIEMBRO pueda abandonar un grupo privado.
-- La RLS de UPDATE en vibe_groups es solo-owner, así que un miembro no puede
-- sacarse a sí mismo del member_ids con un update normal. Esta función corre
-- con security definer y quita SOLO al usuario que la llama.
create or replace function public.leave_vibe_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vibe_groups
  set member_ids = array_remove(coalesce(member_ids, '{}'), auth.uid()::text)
  where id = gid
    and kind = 'private'
    and auth.uid()::text = any(coalesce(member_ids, '{}'));  -- solo si soy miembro
end;
$$;

grant execute on function public.leave_vibe_group(uuid) to authenticated;
