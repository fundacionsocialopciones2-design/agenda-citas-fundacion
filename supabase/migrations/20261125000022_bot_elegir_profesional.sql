-- Migración 22 · bot_elegir_profesional (25 nov 2026)
-- Aprobado por el usuario. Toca código del motor del chatbot (bot_*), escrito por otra persona.
-- Respaldo de lo anterior: supabase/backups/20261125_bot_antes_de_22.sql
--
-- 1. La ficha del servicio muestra los profesionales reales (tabla specialists), no el
--    texto fijo bot_nodos.profesional (que queda solo como respaldo si no hay especialistas).
-- 2. El paciente elige el profesional: nuevo paso «profesional» antes de la fecha, solo si
--    hay 2 o más con horarios libres (con uno solo se asigna sin preguntar). Fechas y horas
--    se filtran por el profesional elegido.
-- 3. bot_horarios_disponibles vuelve a usar agenda.availability (la única regla de
--    disponibilidad). Es SECURITY DEFINER porque service_role no tiene USAGE en «agenda».
--
-- Sin tablas nuevas y sin tocar datos de bot_nodos.

-- Ayudante temporal: reemplaza un fragmento que debe aparecer exactamente una vez.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Disponibilidad del bot = agenda.availability
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bot_horarios_disponibles(p_specialty uuid)
returns table(specialist_id uuid, especialista text, inicio timestamptz, fin timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  -- bot_config solo puede ser más estricta que la regla del canal: mínimo 2 h, máximo 30 días.
  with cfg as (
    select greatest(coalesce((select c.valor::int from public.bot_config c
                               where c.clave = 'cita_anticipacion_horas'), 2), 2) as anticipacion,
           least(coalesce((select c.valor::int from public.bot_config c
                            where c.clave = 'cita_dias_busqueda'), 21), 30) as dias
  )
  select a.specialist_id, a.specialist_name, a.starts_at, a.ends_at
    from cfg,
         agenda.availability(
           p_specialty,
           now(),
           ((now() at time zone 'America/Bogota')::date + cfg.dias + 1)::timestamp at time zone 'America/Bogota',
           make_interval(hours => cfg.anticipacion),
           interval '30 days') a;
$$;
revoke all on function public.bot_horarios_disponibles(uuid) from public, anon, authenticated;
grant execute on function public.bot_horarios_disponibles(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Profesionales con horarios libres, y fechas/horas por profesional
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bot_profesionales_libres(p_esp uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_agg(jsonb_build_object('especialista_id', specialist_id, 'especialista', especialista)
                   order by especialista)
    from (select distinct h.specialist_id, h.especialista
            from bot_horarios_disponibles(p_esp) h) x;
$$;

create or replace function public.bot_fechas_libres(p_esp uuid, p_especialista uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_agg(dia order by dia)
    from (select distinct (h.inicio at time zone bot_tz())::date as dia
            from bot_horarios_disponibles(p_esp) h
           where p_especialista is null or h.specialist_id = p_especialista
           order by 1 limit 7) x;
$$;

-- La versión de un argumento (la usa la reprogramación, bot_gestion_pregunta) delega en la nueva.
create or replace function public.bot_fechas_libres(p_esp uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select bot_fechas_libres(p_esp, null::uuid);
$$;

create or replace function public.bot_horas_libres(p_esp uuid, p_fecha date, p_especialista uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_agg(jsonb_build_object('inicio', inicio, 'especialista_id', specialist_id,
                                      'especialista', especialista) order by inicio)
    from (select distinct on (h.inicio) h.inicio, h.specialist_id, h.especialista
            from bot_horarios_disponibles(p_esp) h
           where (h.inicio at time zone bot_tz())::date = p_fecha
             and (p_especialista is null or h.specialist_id = p_especialista)
           order by h.inicio, h.especialista limit 9) x;
$$;

create or replace function public.bot_horas_libres(p_esp uuid, p_fecha date)
returns jsonb
language sql
stable
set search_path = public
as $$
  select bot_horas_libres(p_esp, p_fecha, null::uuid);
$$;

do $$
declare
  f text;
begin
  foreach f in array array['bot_profesionales_libres(uuid)', 'bot_fechas_libres(uuid, uuid)',
                           'bot_fechas_libres(uuid)', 'bot_horas_libres(uuid, date, uuid)',
                           'bot_horas_libres(uuid, date)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Orden de pasos de la cita: «profesional» antes de «fecha».
create or replace function public.bot_form_siguiente(f jsonb)
returns text
language plpgsql
immutable
as $$
declare
  d     jsonb   := coalesce(f->'datos', '{}');
  v_dom boolean := coalesce(f->'datos'->>'modalidad', '') ilike '%domicilio%';
  p     text;
begin
  foreach p in array case f->>'tipo'
    when 'inscripcion' then array['num_doc','reconocido','tipo_doc','consentimiento','nombre_completo','telefono',
                                  'correo','ciudad','modalidad','direccion']
    when 'cita'        then array['num_doc','reconocido','tipo_doc','consentimiento','nombres','apellidos','telefono',
                                  'modalidad','direccion','profesional','fecha','hora','preferencia']
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
    continue when p in ('profesional','fecha','hora')
              and (f->>'especialidad_id' is null or v_dom or coalesce((f->>'sin_horarios')::boolean, false));
    continue when p = 'preferencia' and d ? 'inicio';
    if p = 'profesional' then
      if not d ? 'especialista_id' then return p; end if;
      continue;
    end if;
    if p = 'hora' then
      if not d ? 'inicio' then return p; end if;
      continue;
    end if;
    if not d ? p then return p; end if;
  end loop;
  return 'confirmar';
end;
$$;

-- Pregunta del paso «profesional» y filtro de fechas/horas por el profesional elegido.
do $migr$
declare
  v text := pg_get_functiondef('public.bot_form_pregunta(jsonb)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$  if v_paso = 'fecha' then$a$, $n$  if v_paso = 'profesional' then
    v_lst := bot_profesionales_libres((f->>'especialidad_id')::uuid);
    if v_lst is null then
      return bot_form_pregunta(f || '{"sin_horarios": true}');   -- sin agenda en línea: proceso abierto
    end if;
    if jsonb_array_length(v_lst) = 1 then                          -- un solo profesional: no se pregunta
      return bot_form_pregunta(jsonb_set(f, '{datos}', d || (v_lst->0)));
    end if;
    f := f || jsonb_build_object('profesionales', v_lst);
    v_txt := '👨‍⚕️ ¿Con qué *profesional* quieres tu cita?';
    select jsonb_agg(bot_op(n::text, p->>'especialista') order by n) into v_ops
      from jsonb_array_elements(v_lst) with ordinality e(p, n);

  elsif v_paso = 'fecha' then$n$);
  v := pg_temp.parchar(v, $a$v_lst := bot_fechas_libres((f->>'especialidad_id')::uuid);$a$,
                          $n$v_lst := bot_fechas_libres((f->>'especialidad_id')::uuid, (d->>'especialista_id')::uuid);$n$);
  v := pg_temp.parchar(v, $a$v_lst := bot_horas_libres((f->>'especialidad_id')::uuid, (d->>'fecha')::date);$a$,
                          $n$v_lst := bot_horas_libres((f->>'especialidad_id')::uuid, (d->>'fecha')::date, (d->>'especialista_id')::uuid);$n$);
  execute v;
end $migr$;

-- Respuesta del paciente en el paso «profesional».
do $migr$
declare
  v text := pg_get_functiondef('public.bot_formulario(text, text, jsonb)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$  when 'hora' then$a$, $n$  when 'profesional' then
    if v_num between 1 and coalesce(jsonb_array_length(f->'profesionales'), 0) then
      d := d || jsonb_build_object('especialista_id', f->'profesionales'->(v_num - 1)->>'especialista_id',
                                   'especialista',    f->'profesionales'->(v_num - 1)->>'especialista');
    else
      v_error := 'Elige uno de los profesionales, por favor.';
    end if;

  when 'hora' then$n$);
  execute v;
end $migr$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ficha del servicio: profesionales reales de la especialidad enlazada
-- ─────────────────────────────────────────────────────────────────────────────
do $migr$
declare
  v text := pg_get_functiondef('public.bot_nodo_resp(text, text)'::regprocedure);
begin
  v := pg_temp.parchar(v, $a$  v_det  text;$a$, $n$  v_det  text;
  v_nombres text;
  v_np      int;$n$);
  v := pg_temp.parchar(v, $a$    v_det := nullif(concat_ws($a$, $n$    select string_agg(s.full_name, ', ' order by s.full_name), count(*)
      into v_nombres, v_np
      from specialties sp
      join specialist_specialties ss on ss.specialty_id = sp.id
      join specialists s on s.id = ss.specialist_id and s.active
     where v_h.accion = 'cita' and sp.active
       and lower(trim(sp.name)) = lower(trim(v_h.especialidad));
    v_det := nullif(concat_ws($n$);
  v := pg_temp.parchar(v, $a$*Profesional:* '       || v_h.profesional,$a$,
    $n$*' || case when v_np > 1 then 'Profesionales' else 'Profesional' end || ':* '
                                   || coalesce(v_nombres, v_h.profesional),$n$);
  execute v;
end $migr$;
