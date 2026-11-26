-- Respaldo previo a la migración 22 (bot_elegir_profesional), 25 nov 2026.
-- Definiciones tal como estaban desplegadas en Supabase antes del cambio.
-- Para revertir: ejecutar las funciones completas de la sección 1 y deshacer los
-- reemplazos puntuales de la sección 2; luego borrar las funciones nuevas de la sección 3.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Funciones reemplazadas por completo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bot_horarios_disponibles(p_specialty uuid)
 RETURNS TABLE(specialist_id uuid, especialista text, inicio timestamp with time zone, fin timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with cfg as (
    select bot_tz() as tz,
           coalesce((select valor::int from bot_config where clave = 'cita_anticipacion_horas'), 2) as anticipacion,
           coalesce((select valor::int from bot_config where clave = 'cita_dias_busqueda'), 21)     as dias
  ),
  esp as (
    select make_interval(mins => sp.slot_minutes::int) as dur
      from specialties sp where sp.id = p_specialty and sp.active
  ),
  dias as (
    select d::date as dia
      from cfg, generate_series((now() at time zone cfg.tz)::date,
                                (now() at time zone cfg.tz)::date + cfg.dias, interval '1 day') d
  )
  select s.id, s.full_name, t.ini, t.ini + esp.dur
    from cfg, esp, dias
    join weekly_schedules ws on ws.weekday = extract(isodow from dias.dia)   -- 1 = lunes … 7 = domingo
    join specialists s on s.id = ws.specialist_id and s.active
    join specialist_specialties ss on ss.specialist_id = s.id and ss.specialty_id = p_specialty
    cross join lateral generate_series(
           (dias.dia + ws.start_time) at time zone cfg.tz,
           ((dias.dia + ws.end_time) at time zone cfg.tz) - esp.dur,
           esp.dur) as t(ini)
   where t.ini > now() + make_interval(hours => cfg.anticipacion)
     and not exists (select 1 from appointments a
                      where a.specialist_id = s.id
                        and a.status::text not in ('cancelada', 'reprogramada')
                        and a.starts_at < t.ini + esp.dur and a.ends_at > t.ini)
     and not exists (select 1 from time_blocks b
                      where b.specialist_id = s.id
                        and b.starts_at < t.ini + esp.dur and b.ends_at > t.ini);
$function$;
-- Permisos que tenía: EXECUTE solo postgres y service_role.

CREATE OR REPLACE FUNCTION public.bot_fechas_libres(p_esp uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_agg(dia order by dia)
    from (select distinct (h.inicio at time zone bot_tz())::date as dia
            from bot_horarios_disponibles(p_esp) h order by 1 limit 7) x;
$function$;

CREATE OR REPLACE FUNCTION public.bot_horas_libres(p_esp uuid, p_fecha date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_agg(jsonb_build_object('inicio', inicio, 'especialista_id', specialist_id,
                                      'especialista', especialista) order by inicio)
    from (select distinct on (h.inicio) h.inicio, h.specialist_id, h.especialista
            from bot_horarios_disponibles(p_esp) h
           where (h.inicio at time zone bot_tz())::date = p_fecha
           order by h.inicio, h.especialista limit 9) x;
$function$;

CREATE OR REPLACE FUNCTION public.bot_form_siguiente(f jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  d     jsonb   := coalesce(f->'datos', '{}');
  v_dom boolean := coalesce(f->'datos'->>'modalidad', '') ilike '%domicilio%';
  p     text;
begin
  foreach p in array case f->>'tipo'
    when 'inscripcion' then array['num_doc','reconocido','tipo_doc','consentimiento','nombre_completo','telefono',
                                  'correo','ciudad','modalidad','direccion']
    when 'cita'        then array['num_doc','reconocido','tipo_doc','consentimiento','nombres','apellidos','telefono',
                                  'modalidad','direccion','fecha','hora','preferencia']
    when 'servicio'    then array['num_doc','reconocido','tipo_doc','consentimiento','nombre_completo','telefono',
                                  'correo','detalle','preferencia']
    when 'urgencia'    then array['num_doc','tipo_doc','consentimiento','nombre_completo','telefono',
                                  'detalle','modalidad','direccion']
    else array[]::text[] end
  loop
    -- Solo se detiene si ya está inscrito en ESTE mismo curso; sus otros trámites se ven en "Mis citas y trámites"
    continue when p = 'reconocido' and not (f ? 'duplicado');
    continue when p = 'modalidad'   and jsonb_array_length(coalesce(f->'modalidades', '[]')) <= 1;
    continue when p = 'direccion'   and not v_dom;
    continue when p in ('fecha','hora')
              and (f->>'especialidad_id' is null or v_dom or coalesce((f->>'sin_horarios')::boolean, false));
    continue when p = 'preferencia' and d ? 'inicio';
    if p = 'hora' then
      if not d ? 'inicio' then return p; end if;
      continue;
    end if;
    if not d ? p then return p; end if;
  end loop;
  return 'confirmar';
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Funciones modificadas con reemplazos puntuales (la migración 22 inserta
--    texto nuevo; el original de cada punto era exactamente este)
-- ─────────────────────────────────────────────────────────────────────────────
-- bot_form_pregunta(jsonb):
--   «  if v_paso = 'fecha' then»
--   «    v_lst := bot_fechas_libres((f->>'especialidad_id')::uuid);»
--   «    v_lst := bot_horas_libres((f->>'especialidad_id')::uuid, (d->>'fecha')::date);»
-- bot_formulario(text, text, jsonb):
--   «  when 'hora' then»   (la 22 inserta antes el caso 'profesional')
-- bot_nodo_resp(text, text):
--   «  v_det  text;»
--   «    v_det := nullif(concat_ws(»
--   «*Profesional:* '       || v_h.profesional,»   (precedido por el emoji 👨‍⚕️)

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Funciones nuevas de la 22 (borrar para revertir)
-- ─────────────────────────────────────────────────────────────────────────────
-- drop function public.bot_profesionales_libres(uuid);
-- drop function public.bot_fechas_libres(uuid, uuid);
-- drop function public.bot_horas_libres(uuid, date, uuid);
