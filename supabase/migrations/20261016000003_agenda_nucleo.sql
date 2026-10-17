-- 03. Lógica única de agenda (esquema interno "agenda", no expuesto por la API).
-- Dashboard y chatbot llaman a estas mismas funciones mediante envoltorios en public (migración 04).
-- Concurrencia: cada reserva/reprogramación bloquea la fila del especialista (FOR UPDATE) y
-- la restricción EXCLUDE de appointments es la última barrera.

create schema if not exists agenda;
revoke all on schema agenda from public, anon, authenticated;

-- Cupos libres de un especialista para una especialidad, dentro de [p_from, p_to).
create function agenda.free_slots(
  p_specialist uuid, p_specialty uuid, p_from timestamptz, p_to timestamptz,
  p_min_notice interval default '0', p_horizon interval default '30 days'
) returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = '' as $$
  with spec as (
    select sp.slot_minutes from public.specialties sp where sp.id = p_specialty and sp.active
  ), ok as (
    select 1 from public.specialists s
    join public.specialist_specialties ss on ss.specialist_id = s.id
    where s.id = p_specialist and s.active and ss.specialty_id = p_specialty
  ), days as (
    select d::date as day
    from generate_series((p_from at time zone 'America/Bogota')::date,
                         (p_to at time zone 'America/Bogota')::date, interval '1 day') d
  ), windows as (
    select ((dy.day + w.start_time) at time zone 'America/Bogota') as w_start,
           ((dy.day + w.end_time) at time zone 'America/Bogota') as w_end
    from days dy
    join public.weekly_schedules w
      on w.specialist_id = p_specialist and w.weekday = extract(isodow from dy.day)::int
    where exists (select 1 from ok) and exists (select 1 from spec)
  ), slots as (
    select g as s, g + make_interval(mins => (select slot_minutes from spec)) as e
    from windows w,
    generate_series(w.w_start,
                    w.w_end - make_interval(mins => (select slot_minutes from spec)),
                    make_interval(mins => (select slot_minutes from spec))) g
  )
  select s, e from slots
  where s >= p_from and s < p_to
    and s >= now() + p_min_notice and s <= now() + p_horizon
    and not exists (
      select 1 from public.time_blocks b
      where b.specialist_id = p_specialist and tstzrange(b.starts_at, b.ends_at) && tstzrange(s, e))
    and not exists (
      select 1 from public.appointments a
      where a.specialist_id = p_specialist and a.status = 'confirmada'
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(s, e))
  order by s
$$;

-- Cupos por especialidad: todos los especialistas activos que la ofrecen.
create function agenda.availability(
  p_specialty uuid, p_from timestamptz, p_to timestamptz,
  p_min_notice interval, p_horizon interval
) returns table (specialist_id uuid, specialist_name text, starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = '' as $$
  select sp.id, sp.full_name, f.starts_at, f.ends_at
  from public.specialist_specialties ss
  join public.specialists sp on sp.id = ss.specialist_id and sp.active
  cross join lateral agenda.free_slots(sp.id, ss.specialty_id, p_from, p_to, p_min_notice, p_horizon) f
  where ss.specialty_id = p_specialty
  order by f.starts_at, sp.full_name
$$;

create function agenda.appt_json(a public.appointments) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'status', a.status,
    'specialist_id', a.specialist_id,
    'specialist_name', (select s.full_name from public.specialists s where s.id = a.specialist_id),
    'specialty_id', a.specialty_id,
    'specialty_name', (select y.name from public.specialties y where y.id = a.specialty_id),
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'starts_local', to_char(a.starts_at at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS"-05:00"'),
    'ends_local', to_char(a.ends_at at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS"-05:00"')
  )
$$;

-- Paciente por tipo+número de documento. No sobrescribe nombres de un paciente existente.
create function agenda.upsert_patient(
  p_doc_type public.document_type, p_doc_number text, p_first text, p_last text,
  p_phone text, p_consent boolean
) returns uuid
language plpgsql set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.patients (document_type, document_number, first_names, last_names, phone, data_consent_at)
  values (p_doc_type, regexp_replace(upper(trim(p_doc_number)), '[^0-9A-Z]', '', 'g'),
          trim(p_first), trim(p_last), nullif(trim(p_phone), ''),
          case when p_consent then now() end)
  on conflict (document_type, document_number) do update
    set phone = coalesce(excluded.phone, public.patients.phone),
        data_consent_at = coalesce(public.patients.data_consent_at, excluded.data_consent_at)
  returning id into v_id;
  return v_id;
end $$;

-- Reserva atómica e idempotente. Devuelve jsonb {ok, code, appointment, replayed}.
create function agenda.book(
  p_patient uuid, p_specialist uuid, p_specialty uuid, p_starts timestamptz,
  p_source public.appointment_source, p_key text, p_actor uuid,
  p_min_notice interval, p_horizon interval
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_slot smallint; v_ends timestamptz; v_ex public.appointments; v_new public.appointments;
begin
  perform 1 from public.specialists where id = p_specialist for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'specialist_not_found'); end if;

  if p_key is not null then
    select * into v_ex from public.appointments where idempotency_key = p_key;
    if found then
      if v_ex.patient_id = p_patient and v_ex.specialist_id = p_specialist and v_ex.starts_at = p_starts then
        return jsonb_build_object('ok', true, 'replayed', true, 'appointment', agenda.appt_json(v_ex));
      end if;
      return jsonb_build_object('ok', false, 'code', 'idempotency_key_reuse');
    end if;
  end if;

  select slot_minutes into v_slot from public.specialties where id = p_specialty and active;
  if not found then return jsonb_build_object('ok', false, 'code', 'specialty_not_found'); end if;
  v_ends := p_starts + make_interval(mins => v_slot);

  perform pg_advisory_xact_lock(hashtextextended(p_patient::text || p_specialty::text, 0));
  if exists (select 1 from public.appointments a
             where a.patient_id = p_patient and a.specialty_id = p_specialty
               and a.status = 'confirmada' and a.starts_at > now()) then
    return jsonb_build_object('ok', false, 'code', 'patient_has_active_appointment');
  end if;

  if not exists (
    select 1 from agenda.free_slots(p_specialist, p_specialty, p_starts, p_starts + interval '1 second',
                                    p_min_notice, p_horizon) f
    where f.starts_at = p_starts
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  begin
    insert into public.appointments (patient_id, specialist_id, specialty_id, starts_at, ends_at, source, idempotency_key, created_by)
    values (p_patient, p_specialist, p_specialty, p_starts, v_ends, p_source, p_key, p_actor)
    returning * into v_new;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
    when unique_violation then
      select * into v_ex from public.appointments where idempotency_key = p_key;
      if found and v_ex.patient_id = p_patient and v_ex.starts_at = p_starts then
        return jsonb_build_object('ok', true, 'replayed', true, 'appointment', agenda.appt_json(v_ex));
      end if;
      return jsonb_build_object('ok', false, 'code', 'idempotency_key_reuse');
  end;
  return jsonb_build_object('ok', true, 'replayed', false, 'appointment', agenda.appt_json(v_new));
end $$;

-- Cancelar conserva el registro y libera el cupo (la restricción solo aplica a 'confirmada').
create function agenda.cancel(p_appointment uuid, p_actor uuid, p_reason text) returns jsonb
language plpgsql set search_path = '' as $$
declare v_a public.appointments;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_a.status <> 'confirmada' then return jsonb_build_object('ok', false, 'code', 'not_cancellable'); end if;
  if v_a.starts_at <= now() then return jsonb_build_object('ok', false, 'code', 'in_past'); end if;
  update public.appointments
     set status = 'cancelada', cancelled_at = now(), cancel_reason = left(p_reason, 200)
   where id = p_appointment returning * into v_a;
  return jsonb_build_object('ok', true, 'appointment', agenda.appt_json(v_a));
end $$;

-- Reprogramar es atómico: si el nuevo horario falla, la cita anterior se conserva.
create function agenda.reschedule(
  p_appointment uuid, p_new_starts timestamptz, p_actor uuid,
  p_min_notice interval, p_horizon interval
) returns jsonb
language plpgsql set search_path = '' as $$
declare v_old public.appointments; v_new public.appointments; v_slot smallint;
begin
  select * into v_old from public.appointments where id = p_appointment for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_old.status <> 'confirmada' then return jsonb_build_object('ok', false, 'code', 'not_reschedulable'); end if;
  if v_old.starts_at <= now() then return jsonb_build_object('ok', false, 'code', 'in_past'); end if;
  if v_old.starts_at = p_new_starts then return jsonb_build_object('ok', false, 'code', 'same_slot'); end if;

  perform 1 from public.specialists where id = v_old.specialist_id for update;
  select slot_minutes into v_slot from public.specialties where id = v_old.specialty_id;

  if not exists (
    select 1 from agenda.free_slots(v_old.specialist_id, v_old.specialty_id, p_new_starts,
                                    p_new_starts + interval '1 second', p_min_notice, p_horizon) f
    where f.starts_at = p_new_starts
  ) then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end if;

  begin
    update public.appointments
       set status = 'cancelada', cancelled_at = now(), cancel_reason = 'reprogramada'
     where id = v_old.id;
    insert into public.appointments (patient_id, specialist_id, specialty_id, starts_at, ends_at, source, rescheduled_from, created_by)
    values (v_old.patient_id, v_old.specialist_id, v_old.specialty_id, p_new_starts,
            p_new_starts + make_interval(mins => v_slot), v_old.source, v_old.id, p_actor)
    returning * into v_new;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'code', 'slot_unavailable');
  end;
  return jsonb_build_object('ok', true, 'appointment', agenda.appt_json(v_new), 'previous_id', v_old.id);
end $$;
