-- Migración 23 · bot_reservas_con_reglas_de_agenda (25 nov 2026)
-- Aprobado por el usuario. Toca código del motor del chatbot (bot_*), escrito por otra persona.
-- Respaldo de lo anterior: supabase/backups/20261125_bot_antes_de_23.sql
--
-- La reserva y la reprogramación por WhatsApp vuelven a pasar por agenda.book / agenda.reschedule
-- (bloqueo del especialista, cupo revalidado con mínimo 2 h y máximo 30 días, idempotencia, choque
-- de horario). Decisión del usuario: el bot NO aplica «una cita activa por paciente y especialidad»
-- ni el límite de 2 citas activas por teléfono. El administrador conserva la primera regla.
-- Además: una reserva fallida no deja paciente creado y el texto del error ya no se guarda.

create or replace function pg_temp.parchar(p_def text, p_ancla text, p_nuevo text)
returns text language plpgsql as $$
declare
  v_n int := (length(p_def) - length(replace(p_def, p_ancla, ''))) / greatest(length(p_ancla), 1);
begin
  if v_n <> 1 then
    raise exception 'Ancla encontrada % veces (se esperaba 1): %', v_n, p_ancla;
  end if;
  return replace(p_def, p_ancla, p_nuevo);
end $$;

create or replace function pg_temp.parchar_re(p_def text, p_patron text, p_nuevo text)
returns text language plpgsql as $$
declare
  v_n int := (select count(*) from regexp_matches(p_def, p_patron, 'g'));
begin
  if v_n <> 1 then
    raise exception 'Patrón encontrado % veces (se esperaba 1): %', v_n, p_patron;
  end if;
  return regexp_replace(p_def, p_patron, p_nuevo);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Núcleo de la reserva con la regla «una por especialidad» opcional
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function agenda.book_core(p_patient uuid, p_specialist uuid, p_specialty uuid,
                                            p_starts timestamptz, p_source public.appointment_source,
                                            p_key text, p_actor uuid, p_min_notice interval,
                                            p_horizon interval, p_una_por_especialidad boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
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

  if p_una_por_especialidad then
    perform pg_advisory_xact_lock(hashtextextended(p_patient::text || p_specialty::text, 0));
    if exists (select 1 from public.appointments a
               where a.patient_id = p_patient and a.specialty_id = p_specialty
                 and a.status = 'confirmada' and a.starts_at > now()) then
      return jsonb_build_object('ok', false, 'code', 'patient_has_active_appointment');
    end if;
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
revoke all on function agenda.book_core(uuid, uuid, uuid, timestamptz, public.appointment_source, text, uuid,
                                        interval, interval, boolean) from public, anon, authenticated;

-- agenda.book (la usa admin_book_appointment) conserva su comportamiento: con la regla.
create or replace function agenda.book(p_patient uuid, p_specialist uuid, p_specialty uuid,
                                       p_starts timestamptz, p_source public.appointment_source,
                                       p_key text, p_actor uuid, p_min_notice interval, p_horizon interval)
returns jsonb
language sql
set search_path = ''
as $$
  select agenda.book_core(p_patient, p_specialist, p_specialty, p_starts, p_source, p_key, p_actor,
                          p_min_notice, p_horizon, true);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Envoltorios para el bot (solo service_role)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bot_reservar_cita(p_patient uuid, p_specialist uuid, p_specialty uuid,
                                                    p_starts timestamptz, p_key text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select agenda.book_core(
           p_patient, p_specialist, p_specialty, p_starts, 'whatsapp', p_key, null,
           make_interval(hours => greatest(coalesce((select c.valor::int from public.bot_config c
                                                      where c.clave = 'cita_anticipacion_horas'), 2), 2)),
           interval '30 days',
           false);   -- decisión del usuario: sin «una cita activa por paciente y especialidad»
$$;

create or replace function public.bot_reprogramar_cita(p_appointment uuid, p_doc text, p_new_starts timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo el dueño (documento ya verificado con el WhatsApp por bot_persona) puede reprogramar.
  if not exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
                  where a.id = p_appointment and p.document_number = p_doc) then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  return agenda.reschedule(
           p_appointment, p_new_starts, null,
           make_interval(hours => greatest(coalesce((select c.valor::int from public.bot_config c
                                                      where c.clave = 'cita_anticipacion_horas'), 2), 2)),
           interval '30 days');
end $$;

revoke all on function public.bot_reservar_cita(uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.bot_reprogramar_cita(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.bot_reservar_cita(uuid, uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.bot_reprogramar_cita(uuid, text, timestamptz) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- bot_form_iniciar: clave de idempotencia por formulario (un reintento del mismo
-- mensaje no duplica la cita; una reserva nueva usa otra clave)
-- ─────────────────────────────────────────────────────────────────────────────
do $migr$
declare
  v text := pg_get_functiondef('public.bot_form_iniciar(text, text)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$'tipo', v_her.accion, 'nodo', p_nodo,$a$,
                          $n$'clave', gen_random_uuid()::text, 'tipo', v_her.accion, 'nodo', p_nodo,$n$);
  execute v;
end $migr$;

-- ─────────────────────────────────────────────────────────────────────────────
-- bot_form_guardar: reserva con bot_reservar_cita
-- ─────────────────────────────────────────────────────────────────────────────
do $migr$
declare
  v text := pg_get_functiondef('public.bot_form_guardar(text, jsonb)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$  v_motivo text;$a$, $n$  v_motivo text;
  v_res    jsonb;$n$);
  -- Si el horario ya no está, se vuelve a la fecha conservando el profesional elegido.
  v := pg_temp.parchar(v, $a$d - 'fecha' - 'inicio' - 'especialista_id' - 'especialista'));$a$,
                          $n$d - 'fecha' - 'inicio'));$n$);
  v := pg_temp.parchar_re(v, $p$v_pid := bot_guardar_paciente\(d\);.*?'wa-' \|\| gen_random_uuid\(\)::text;$p$,
    $n$v_pid := bot_guardar_paciente(d);
      v_res := bot_reservar_cita(v_pid, (d->>'especialista_id')::uuid, (f->>'especialidad_id')::uuid, v_ini,
                                 'wa-' || coalesce(f->>'clave', gen_random_uuid()::text));
      if v_res->>'code' = 'slot_unavailable' then
        raise exception using errcode = 'AG498';   -- se ocupó: deshace el paciente recién creado
      elsif not coalesce((v_res->>'ok')::boolean, false) then
        raise exception using errcode = 'AG499';   -- otro fallo: deshace y deja la solicitud
      end if;$n$);
  v := pg_temp.parchar_re(v, $p$exception when others then\s*v_motivo := 'Error al agendar automáticamente: ' \|\| sqlerrm;$p$,
    $n$exception
      when sqlstate 'AG498' then
        r := bot_form_pregunta(jsonb_set(f, '{datos}', d - 'fecha' - 'inicio'));
        return jsonb_build_object('form', r->'form',
          'r', bot_con_aviso(r->'r', '😕 Ese horario acaba de ser reservado. Elige otro, por favor.'));
      when others then
        v_motivo := 'Error al agendar automáticamente';   -- sin el texto de Postgres$n$);
  execute v;
end $migr$;

-- ─────────────────────────────────────────────────────────────────────────────
-- bot_gestion: reprogramar con bot_reprogramar_cita (agenda.reschedule)
-- ─────────────────────────────────────────────────────────────────────────────
do $migr$
declare
  v text := pg_get_functiondef('public.bot_gestion(text, text, jsonb)'::regprocedure);
begin
  v := pg_temp.parchar_re(v, $p$v_ok\s+int;$p$, $n$v_ok    int;
  v_res   jsonb;$n$);
  v := pg_temp.parchar_re(v,
    $p$perform pg_advisory_xact_lock\(hashtext\('cita:' \|\| \(f->'nuevo'->>'especialista_id'\)\)\);.*?using 'cancelada', \(v_it->>'id'\)::uuid;\s*end if;$p$,
    $n$v_res := bot_reprogramar_cita((v_it->>'id')::uuid, f->>'doc', (f->'nuevo'->>'inicio')::timestamptz);
    if v_res->>'code' = 'slot_unavailable' then
      return bot_gestion_pregunta(f || '{"paso": "g_fecha"}', '😕 Ese horario acaba de ser reservado. Elige otro, por favor.');
    elsif not coalesce((v_res->>'ok')::boolean, false) then
      return bot_gestion_pregunta(f || '{"paso": "g_lista"}',
        'No pudimos reprogramar tu cita. Inténtalo de nuevo o comunícate al *' || v_tel_f || '*.');
    end if;$n$);
  execute v;
end $migr$;

-- Reprogramar ofrece solo horarios del mismo profesional (agenda.reschedule lo conserva).
do $migr$
declare
  v text := pg_get_functiondef('public.bot_gestion_pregunta(jsonb, text)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$v_lst := bot_fechas_libres((v_it->>'specialty_id')::uuid);$a$,
    $n$v_lst := bot_fechas_libres((v_it->>'specialty_id')::uuid,
                               (select a.specialist_id from appointments a where a.id = (v_it->>'id')::uuid));$n$);
  v := pg_temp.parchar(v, $a$v_lst := bot_horas_libres((v_it->>'specialty_id')::uuid, (f->>'fecha')::date);$a$,
    $n$v_lst := bot_horas_libres((v_it->>'specialty_id')::uuid, (f->>'fecha')::date,
                              (select a.specialist_id from appointments a where a.id = (v_it->>'id')::uuid));$n$);
  execute v;
end $migr$;
