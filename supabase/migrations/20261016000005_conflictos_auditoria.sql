-- 05. Conflictos con citas futuras (nunca se cancela en silencio) + auditoría + blindaje de roles.
-- Cambiar horario semanal, crear/editar bloqueos o desactivar un especialista falla (SQLSTATE AG409)
-- si deja citas futuras confirmadas fuera de horario, sobre un bloqueo o con especialista inactivo.
-- La comprobación es diferida (al COMMIT) y toma el bloqueo del especialista al modificar, de modo que
-- es consistente con reservas concurrentes (agenda.book bloquea la misma fila).

create function agenda.conflicting_appointments(p_specialist uuid) returns setof public.appointments
language sql stable security definer set search_path = '' as $$
  select a.*
  from public.appointments a
  join public.specialists s on s.id = a.specialist_id
  where a.specialist_id = p_specialist and a.status = 'confirmada' and a.starts_at > now()
    and (
      not s.active
      or exists (select 1 from public.time_blocks b
                 where b.specialist_id = a.specialist_id
                   and tstzrange(b.starts_at, b.ends_at) && tstzrange(a.starts_at, a.ends_at))
      or not exists (select 1 from public.weekly_schedules w
                     where w.specialist_id = a.specialist_id
                       and w.weekday = extract(isodow from (a.starts_at at time zone 'America/Bogota'))::int
                       and (a.starts_at at time zone 'America/Bogota')::time >= w.start_time
                       and (a.ends_at at time zone 'America/Bogota')::time <= w.end_time)
    )
$$;

create function agenda.trg_lock_specialist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.specialists where id = coalesce(new.id, old.id) for update;
  return coalesce(new, old);
end $$;

create function agenda.trg_lock_specialist_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.specialists where id = coalesce(new.specialist_id, old.specialist_id) for update;
  return coalesce(new, old);
end $$;

create function agenda.trg_assert_no_conflicts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sp uuid; v_n integer; v_ids text;
begin
  v_sp := case when tg_table_name = 'specialists' then coalesce(new.id, old.id)
               else coalesce(new.specialist_id, old.specialist_id) end;
  select count(*), string_agg(c.id::text, ',') into v_n, v_ids from agenda.conflicting_appointments(v_sp) c;
  if v_n > 0 then
    raise exception 'schedule_conflict: % cita(s) futura(s) confirmada(s) quedarían fuera de horario, sobre un bloqueo o con el especialista inactivo. Reprográmalas o cancélalas primero.', v_n
      using errcode = 'AG409', detail = v_ids;
  end if;
  return null;
end $$;

create trigger trg_sched_lock before insert or update or delete on public.weekly_schedules
  for each row execute function agenda.trg_lock_specialist_child();
create trigger trg_blocks_lock before insert or update or delete on public.time_blocks
  for each row execute function agenda.trg_lock_specialist_child();
create trigger trg_specialists_lock before update of active on public.specialists
  for each row execute function agenda.trg_lock_specialist();

create constraint trigger trg_sched_conflicts after insert or update or delete on public.weekly_schedules
  deferrable initially deferred for each row execute function agenda.trg_assert_no_conflicts();
create constraint trigger trg_blocks_conflicts after insert or update on public.time_blocks
  deferrable initially deferred for each row execute function agenda.trg_assert_no_conflicts();
create constraint trigger trg_specialists_conflicts after update of active on public.specialists
  deferrable initially deferred for each row execute function agenda.trg_assert_no_conflicts();

create function public.specialist_deactivation_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.active and not new.active then new.deactivated_at := now();
  elsif not old.active and new.active then new.deactivated_at := null; end if;
  return new;
end $$;
create trigger trg_specialists_stamp before update of active on public.specialists
  for each row execute function public.specialist_deactivation_stamp();

-- Lista de citas en conflicto para que el administrador las resuelva (incluye nombre de paciente).
create function public.admin_schedule_conflicts(p_specialist_id uuid)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, patient_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.starts_at, c.ends_at, p.first_names || ' ' || p.last_names
    from agenda.conflicting_appointments(p_specialist_id) c
    join public.patients p on p.id = c.patient_id
    order by c.starts_at;
end $$;
revoke all on function public.admin_schedule_conflicts(uuid) from public, anon, authenticated;
grant execute on function public.admin_schedule_conflicts(uuid) to authenticated, service_role;

-- Roles: ningún cliente puede cambiar role/active (defensa adicional a la falta de grants).
create function public.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'forbidden: los roles solo los gestiona el servidor' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_profiles_guard before insert or update or delete on public.profiles
  for each row execute function public.profiles_guard();

-- Auditoría sin datos personales de pacientes (solo ids, estados y horas).
create function agenda.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(coalesce(new, old)); v_old jsonb := to_jsonb(old); v_details jsonb;
begin
  v_details := case tg_table_name
    when 'appointments' then jsonb_build_object('status', v_row->>'status', 'from_status', v_old->>'status',
      'starts_at', v_row->>'starts_at', 'specialist_id', v_row->>'specialist_id', 'source', v_row->>'source')
    when 'weekly_schedules' then jsonb_build_object('specialist_id', v_row->>'specialist_id', 'weekday', v_row->>'weekday',
      'start_time', v_row->>'start_time', 'end_time', v_row->>'end_time')
    when 'time_blocks' then jsonb_build_object('specialist_id', v_row->>'specialist_id', 'kind', v_row->>'kind',
      'starts_at', v_row->>'starts_at', 'ends_at', v_row->>'ends_at')
    when 'specialists' then jsonb_build_object('active', v_row->>'active', 'was_active', v_old->>'active')
    when 'profiles' then jsonb_build_object('role', v_row->>'role', 'was_role', v_old->>'role', 'active', v_row->>'active')
    else '{}'::jsonb end;
  insert into public.audit_log (actor_id, actor_label, action, entity, entity_id, details)
  values ((select auth.uid()),
          case when (select auth.uid()) is null then 'sistema' else 'usuario' end,
          lower(tg_op), tg_table_name, (v_row->>'id')::uuid, v_details);
  return null;
end $$;

create trigger trg_audit_appointments after insert or update or delete on public.appointments for each row execute function agenda.audit_row();
create trigger trg_audit_schedules after insert or update or delete on public.weekly_schedules for each row execute function agenda.audit_row();
create trigger trg_audit_blocks after insert or update or delete on public.time_blocks for each row execute function agenda.audit_row();
create trigger trg_audit_specialists after insert or update on public.specialists for each row execute function agenda.audit_row();
create trigger trg_audit_profiles after insert or update or delete on public.profiles for each row execute function agenda.audit_row();
create trigger trg_audit_patients after insert on public.patients for each row execute function agenda.audit_row();
