-- 04. Funciones públicas (RPC). Reglas de ventana del chatbot: mínimo 2 horas, máximo 30 días.
-- admin_*  -> usuarios autenticados con rol admin (verificado dentro de la función).
-- my_agenda -> especialista autenticado, solo sus citas y datos mínimos del paciente.
-- bot_*    -> solo service_role (se invocan desde la Edge Function bot-api, nunca desde el navegador).

create function public.admin_book_appointment(
  p_patient_id uuid, p_specialist_id uuid, p_specialty_id uuid, p_starts_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.book(p_patient_id, p_specialist_id, p_specialty_id, p_starts_at, 'dashboard', null,
                     (select auth.uid()), interval '0', interval '365 days');
end $$;

create function public.admin_cancel_appointment(p_appointment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.cancel(p_appointment_id, (select auth.uid()), p_reason);
end $$;

create function public.admin_reschedule_appointment(p_appointment_id uuid, p_new_starts_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.reschedule(p_appointment_id, p_new_starts_at, (select auth.uid()), interval '0', interval '365 days');
end $$;

create function public.admin_free_slots(
  p_specialist_id uuid, p_specialty_id uuid, p_from timestamptz, p_to timestamptz
) returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select f.starts_at, f.ends_at
    from agenda.free_slots(p_specialist_id, p_specialty_id, p_from, p_to, interval '0', interval '365 days') f;
end $$;

create function public.admin_upsert_patient(
  p_document_type public.document_type, p_document_number text, p_first_names text,
  p_last_names text, p_phone text default null, p_consent boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.upsert_patient(p_document_type, p_document_number, p_first_names, p_last_names, p_phone, p_consent);
end $$;

create function public.admin_set_attendance(p_appointment_id uuid, p_status public.appointment_status)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_a public.appointments;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('asistida', 'no_asistio') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  select * into v_a from public.appointments where id = p_appointment_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_a.status <> 'confirmada' then return jsonb_build_object('ok', false, 'code', 'not_confirmed'); end if;
  if v_a.starts_at > now() then return jsonb_build_object('ok', false, 'code', 'not_started'); end if;
  update public.appointments set status = p_status where id = p_appointment_id returning * into v_a;
  return jsonb_build_object('ok', true, 'appointment', agenda.appt_json(v_a));
end $$;

-- Agenda del especialista autenticado: solo nombre y documento del paciente (sin teléfono).
create function public.my_agenda(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status public.appointment_status,
  specialty_name text, patient_first_names text, patient_last_names text,
  patient_document_type public.document_type, patient_document_number text
) language plpgsql stable security definer set search_path = '' as $$
declare v_sp uuid := public.my_specialist_id();
begin
  if v_sp is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select a.id, a.starts_at, a.ends_at, a.status, y.name, p.first_names, p.last_names, p.document_type, p.document_number
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    join public.specialties y on y.id = a.specialty_id
    where a.specialist_id = v_sp and a.starts_at >= p_from and a.starts_at < p_to
    order by a.starts_at;
end $$;

-- Contrato del chatbot ------------------------------------------------------

create function public.bot_list_specialties() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name) order by y.name), '[]'::jsonb)
  from public.specialties y
  where y.active and exists (
    select 1 from public.specialist_specialties ss
    join public.specialists s on s.id = ss.specialist_id and s.active
    where ss.specialty_id = y.id)
$$;

create function public.bot_availability(
  p_specialty_id uuid, p_days integer default 30, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_slots jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'specialist_id', t.specialist_id,
      'specialist_name', t.specialist_name,
      'starts_at', t.starts_at,
      'starts_local', to_char(t.starts_at at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS"-05:00"'),
      'ends_local', to_char(t.ends_at at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS"-05:00"')
    ) order by t.starts_at), '[]'::jsonb)
  into v_slots
  from (
    select * from agenda.availability(p_specialty_id, now(), now() + make_interval(days => least(greatest(p_days, 1), 30)),
                                      interval '2 hours', interval '30 days')
    limit least(greatest(p_limit, 1), 50)
  ) t;
  return jsonb_build_object('ok', true, 'slots', v_slots);
end $$;

create function public.bot_book_appointment(
  p_idempotency_key text, p_specialist_id uuid, p_specialty_id uuid, p_starts_at timestamptz,
  p_document_type public.document_type, p_document_number text, p_first_names text, p_last_names text,
  p_phone text default null, p_consent boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_doc text := regexp_replace(upper(trim(coalesce(p_document_number, ''))), '[^0-9A-Z]', '', 'g'); v_patient uuid;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    return jsonb_build_object('ok', false, 'code', 'idempotency_key_required');
  end if;
  if not coalesce(p_consent, false) then
    return jsonb_build_object('ok', false, 'code', 'consent_required');
  end if;
  if v_doc !~ '^[0-9A-Z]{4,20}$' or length(trim(coalesce(p_first_names, ''))) = 0
     or length(trim(coalesce(p_last_names, ''))) = 0
     or (nullif(trim(p_phone), '') is not null and trim(p_phone) !~ '^\+?[0-9]{7,15}$') then
    return jsonb_build_object('ok', false, 'code', 'invalid_patient_data');
  end if;
  v_patient := agenda.upsert_patient(p_document_type, v_doc, p_first_names, p_last_names, p_phone, true);
  return agenda.book(v_patient, p_specialist_id, p_specialty_id, p_starts_at, 'whatsapp',
                     p_idempotency_key, null, interval '2 hours', interval '30 days');
end $$;

-- Permisos de ejecución: nada para anon/public por defecto.
revoke all on function
  public.admin_book_appointment(uuid, uuid, uuid, timestamptz),
  public.admin_cancel_appointment(uuid, text),
  public.admin_reschedule_appointment(uuid, timestamptz),
  public.admin_free_slots(uuid, uuid, timestamptz, timestamptz),
  public.admin_upsert_patient(public.document_type, text, text, text, text, boolean),
  public.admin_set_attendance(uuid, public.appointment_status),
  public.my_agenda(timestamptz, timestamptz),
  public.bot_list_specialties(),
  public.bot_availability(uuid, integer, integer),
  public.bot_book_appointment(text, uuid, uuid, timestamptz, public.document_type, text, text, text, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.admin_book_appointment(uuid, uuid, uuid, timestamptz),
  public.admin_cancel_appointment(uuid, text),
  public.admin_reschedule_appointment(uuid, timestamptz),
  public.admin_free_slots(uuid, uuid, timestamptz, timestamptz),
  public.admin_upsert_patient(public.document_type, text, text, text, text, boolean),
  public.admin_set_attendance(uuid, public.appointment_status),
  public.my_agenda(timestamptz, timestamptz)
to authenticated, service_role;

grant execute on function
  public.bot_list_specialties(),
  public.bot_availability(uuid, integer, integer),
  public.bot_book_appointment(text, uuid, uuid, timestamptz, public.document_type, text, text, text, text, boolean)
to service_role;
