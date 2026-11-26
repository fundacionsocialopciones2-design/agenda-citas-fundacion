-- Respaldo previo a la migración 23 (bot_reservas_con_reglas_de_agenda), 25 nov 2026.
-- Para revertir: restaurar agenda.book (sección 1), deshacer los reemplazos de la sección 2
-- (el texto original de cada punto está abajo) y borrar las funciones de la sección 3.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. agenda.book tal como estaba (la 23 la convierte en envoltorio de agenda.book_core)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION agenda.book(p_patient uuid, p_specialist uuid, p_specialty uuid, p_starts timestamp with time zone, p_source appointment_source, p_key text, p_actor uuid, p_min_notice interval, p_horizon interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fragmentos originales de las funciones del bot modificadas por la 23
--    (los cuerpos usan saltos de línea CRLF)
-- ─────────────────────────────────────────────────────────────────────────────

-- bot_form_iniciar: se añadió 'clave' (clave de idempotencia por formulario) antes de:
--     'tipo', v_her.accion, 'nodo', p_nodo, 'servicio', v_nodo.titulo, 'categoria', v_cat,

-- bot_form_guardar, declaración: se añadió «v_res jsonb;» después de «  v_motivo text;»
-- bot_form_guardar, horario ocupado (antes también olvidaba el profesional):
--         r := bot_form_pregunta(jsonb_set(f, '{datos}', d - 'fecha' - 'inicio' - 'especialista_id' - 'especialista'));
-- bot_form_guardar, reserva (insertaba directo en appointments):
--       v_pid := bot_guardar_paciente(d);
--       execute format(
--         'insert into appointments (patient_id, specialist_id, specialty_id, starts_at, ends_at, source, idempotency_key)
--          values ($1, $2, $3, $4, $5, $6::%s, $7)', bot_tipo_columna('appointments', 'source'))
--         using v_pid, (d->>'especialista_id')::uuid, (f->>'especialidad_id')::uuid, v_ini, v_fin,
--               bot_enum_preferido('appointments', 'source', array['whatsapp','chatbot','bot','chat','web','online','virtual']),
--               'wa-' || gen_random_uuid()::text;
-- bot_form_guardar, manejo de errores (guardaba el texto de Postgres en bot_solicitudes.motivo):
--     exception when others then
--       v_motivo := 'Error al agendar automáticamente: ' || sqlerrm;

-- bot_gestion, declaración: se añadió «v_res jsonb;» después de «v_ok int;»
-- bot_gestion, paso g_confirmar_reprog (insertaba la cita nueva y marcaba la anterior a mano):
--     perform pg_advisory_xact_lock(hashtext('cita:' || (f->'nuevo'->>'especialista_id')));
--     select h.fin into v_fin
--       from bot_horarios_disponibles((v_it->>'specialty_id')::uuid) h
--      where h.specialist_id = (f->'nuevo'->>'especialista_id')::uuid and h.inicio = (f->'nuevo'->>'inicio')::timestamptz;
--     if v_fin is null then
--       return bot_gestion_pregunta(f || '{"paso": "g_fecha"}', '😕 Ese horario acaba de ser reservado. Elige otro, por favor.');
--     end if;
--     select a.patient_id into v_pid
--       from appointments a join patients p on p.id = a.patient_id
--      where a.id = (v_it->>'id')::uuid and p.document_number = f->>'doc';
--     if v_pid is null then
--       return bot_gestion_pregunta(f || '{"paso": "g_lista"}', 'No encontramos esa cita.');
--     end if;
--     execute format(
--       'insert into appointments (patient_id, specialist_id, specialty_id, starts_at, ends_at, source,
--                                  idempotency_key, rescheduled_from)
--        values ($1, $2, $3, $4, $5, $6::%s, $7, $8) returning id', bot_tipo_columna('appointments', 'source'))
--       into v_new
--       using v_pid, (f->'nuevo'->>'especialista_id')::uuid, (v_it->>'specialty_id')::uuid,
--             (f->'nuevo'->>'inicio')::timestamptz, v_fin,
--             bot_enum_preferido('appointments', 'source', array['whatsapp','chatbot','bot','chat','web','online','virtual']),
--             'wa-' || gen_random_uuid()::text, (v_it->>'id')::uuid;
--     -- La cita anterior queda como "reprogramada" (o cancelada, si tu sistema no tiene ese estado)
--     v_st := bot_enum_preferido('appointments', 'status', array['reprogram']);
--     if v_st ilike '%reprogram%' then
--       execute format('update appointments set status = $1::%s, updated_at = now() where id = $2',
--                      bot_tipo_columna('appointments', 'status')) using v_st, (v_it->>'id')::uuid;
--     else
--       execute format('update appointments set status = $1::%s, cancelled_at = now(), updated_at = now(),
--                              cancel_reason = ''Reprogramada por el paciente vía WhatsApp'' where id = $2',
--                      bot_tipo_columna('appointments', 'status')) using 'cancelada', (v_it->>'id')::uuid;
--     end if;

-- bot_gestion_pregunta (reprogramar: cualquier profesional de la especialidad):
--     v_lst := bot_fechas_libres((v_it->>'specialty_id')::uuid);
--     v_lst := bot_horas_libres((v_it->>'specialty_id')::uuid, (f->>'fecha')::date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Funciones nuevas de la 23 (borrar para revertir, después de restaurar lo anterior)
-- ─────────────────────────────────────────────────────────────────────────────
-- drop function public.bot_reservar_cita(uuid, uuid, uuid, timestamptz, text);
-- drop function public.bot_reprogramar_cita(uuid, text, timestamptz);
-- drop function agenda.book_core(uuid, uuid, uuid, timestamptz, public.appointment_source, text, uuid, interval, interval, boolean);
