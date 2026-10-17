-- 08. Operaciones atómicas de administración + correo visible en perfiles.
-- Cada RPC hace SET CONSTRAINTS ALL IMMEDIATE al final: la verificación de conflictos con citas futuras
-- (SQLSTATE AG409, con los ids en DETAIL) se produce dentro de la función y toda la operación se revierte.

alter table public.profiles add column email text;

create function public.admin_set_weekly_schedule(p_specialist_id uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.weekly_schedules where specialist_id = p_specialist_id;
  insert into public.weekly_schedules (specialist_id, weekday, start_time, end_time)
  select p_specialist_id, (r->>'weekday')::smallint, (r->>'start_time')::time, (r->>'end_time')::time
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r;
  set constraints all immediate;
end $$;

create function public.admin_save_block(
  p_id uuid, p_specialist_id uuid, p_kind public.block_kind,
  p_starts_at timestamptz, p_ends_at timestamptz, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.time_blocks (specialist_id, kind, starts_at, ends_at, note, created_by)
    values (p_specialist_id, p_kind, p_starts_at, p_ends_at, nullif(trim(p_note), ''), (select auth.uid()))
    returning id into v_id;
  else
    update public.time_blocks
       set kind = p_kind, starts_at = p_starts_at, ends_at = p_ends_at, note = nullif(trim(p_note), '')
     where id = p_id and specialist_id = p_specialist_id
    returning id into v_id;
    if v_id is null then raise exception 'bloqueo no encontrado' using errcode = 'P0002'; end if;
  end if;
  set constraints all immediate;
  return v_id;
end $$;

create function public.admin_set_specialist_active(p_specialist_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.specialists set active = p_active where id = p_specialist_id;
  if not found then raise exception 'especialista no encontrado' using errcode = 'P0002'; end if;
  set constraints all immediate;
end $$;

revoke all on function
  public.admin_set_weekly_schedule(uuid, jsonb),
  public.admin_save_block(uuid, uuid, public.block_kind, timestamptz, timestamptz, text),
  public.admin_set_specialist_active(uuid, boolean)
from public, anon, authenticated;
grant execute on function
  public.admin_set_weekly_schedule(uuid, jsonb),
  public.admin_save_block(uuid, uuid, public.block_kind, timestamptz, timestamptz, text),
  public.admin_set_specialist_active(uuid, boolean)
to authenticated, service_role;
