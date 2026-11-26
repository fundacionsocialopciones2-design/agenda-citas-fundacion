-- Pruebas de la migración 22 (bot_elegir_profesional). No deja datos: begin … rollback.
-- Usa los especialistas reales de Psicología (Camilo Alemán, Orquídea Chaparro) y Periodoncia
-- (un solo profesional). Paciente y teléfono ficticios.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);
create temp table t_ctx as
select (select id from public.specialties where name = 'Psicología')  as psico,
       (select id from public.specialties where name = 'Periodoncia') as perio,
       (select id from public.specialists where full_name = 'Orquídea Chaparro') as orquidea,
       (select id from public.specialists where full_name = 'Camilo Armando Alemán Herrera') as camilo;
grant select on t_ctx to service_role;

-- 1. La disponibilidad del bot es exactamente la de agenda.availability (mismo conjunto de cupos)
insert into t_res
with bot as (select specialist_id, inicio from public.bot_horarios_disponibles((select psico from t_ctx))),
     ag  as (select a.specialist_id, a.starts_at as inicio
               from agenda.availability((select psico from t_ctx), now(),
                      ((now() at time zone 'America/Bogota')::date + 22)::timestamp at time zone 'America/Bogota',
                      interval '2 hours', interval '30 days') a)
select 1, 'bot_horarios_disponibles = agenda.availability',
       (select count(*) from bot) > 0
         and not exists (select * from bot except select * from ag)
         and not exists (select * from ag except select * from bot),
       (select count(*) from bot)::text || ' cupos';

-- 2. Permisos: solo service_role ejecuta las funciones del bot que leen la agenda
insert into t_res
select 2, 'anon/authenticated no ejecutan las funciones nuevas',
       not bool_or(has_function_privilege(r, f, 'execute')),
       string_agg(r || ':' || f, ', ') filter (where has_function_privilege(r, f, 'execute'))
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.bot_horarios_disponibles(uuid)', 'public.bot_profesionales_libres(uuid)',
                    'public.bot_fechas_libres(uuid,uuid)', 'public.bot_horas_libres(uuid,date,uuid)']) f;

-- 3–9. Como service_role (lo que usa n8n)
do $$
declare
  c         record;
  v_prof    jsonb;
  v_fechas  jsonb;
  v_horas   jsonb;
  v_ficha_p text;
  v_ficha_o text;
  v_err     text;
  v_tel     text := '570000000099';
  v_textos  text[] := '{}';
  v_msg     text;
  v_r       jsonb;
  v_pfin    jsonb;
begin
  select * into c from t_ctx;
  set local role service_role;
  begin
    v_prof   := public.bot_profesionales_libres(c.psico);
    v_fechas := public.bot_fechas_libres(c.psico, c.orquidea);
    v_horas  := public.bot_horas_libres(c.psico, (v_fechas->>0)::date, c.orquidea);
    v_ficha_p := public.bot_nodo_resp('sal_mental')->>'cuerpo';
    v_ficha_o := public.bot_nodo_resp('odo_periodoncia')->>'cuerpo';
    -- Flujo completo por WhatsApp: paciente nuevo que elige a la 2.ª profesional (Orquídea)
    foreach v_msg in array array['hola', '2', '3', '1', '9990001112', '1', '1', 'Prueba', 'Ficticia',
                                 '1', '1', '2', '1', '1', '1']
    loop
      v_r := public.bot_responder(v_tel, v_msg, 'Prueba');
      v_textos := v_textos || coalesce(v_r->>'texto', '');
    end loop;
    -- Periodoncia (un solo profesional): el paso se salta y queda asignado
    v_pfin := public.bot_form_pregunta(jsonb_build_object(
      'tipo', 'cita', 'especialidad_id', c.perio, 'modalidades', '["En sede"]'::jsonb,
      'datos', jsonb_build_object('num_doc', '1', 'tipo_doc', 'CC', 'consentimiento', now(), 'nombres', 'A',
                                  'apellidos', 'B', 'telefono', '1', 'modalidad', 'En sede')));
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;

  insert into t_res values
    (3, 'service_role ejecuta todo sin error', v_err is null, v_err),
    (4, 'Psicología ofrece 2 profesionales, en orden',
        jsonb_array_length(v_prof) = 2
          and v_prof->0->>'especialista_id' = c.camilo::text
          and v_prof->1->>'especialista_id' = c.orquidea::text, v_prof::text),
    (5, 'Horas filtradas por la profesional elegida',
        jsonb_array_length(v_horas) > 0
          and not exists (select 1 from jsonb_array_elements(v_horas) h
                           where h->>'especialista_id' <> c.orquidea::text),
        jsonb_array_length(v_horas)::text || ' horas'),
    (6, 'Ficha de Salud mental nombra a ambos',
        v_ficha_p like '%*Profesionales:* Camilo Armando Alemán Herrera, Orquídea Chaparro%', v_ficha_p),
    (7, 'Ficha de Periodoncia nombra a la profesional real',
        v_ficha_o like '%*Profesional:* Dra. Clemencia Vaquero%', null),
    (8, 'El bot pregunta el profesional y lista a ambos',
        v_textos[11] like '%Con qué *profesional*%' and v_textos[11] like '%Camilo%'
          and v_textos[11] like '%Orquídea Chaparro%', v_textos[11]),
    (9, 'La cita queda con la profesional elegida',
        exists (select 1 from public.appointments a join public.patients p on p.id = a.patient_id
                 where p.document_number = '9990001112' and a.specialist_id = c.orquidea
                   and a.status = 'confirmada'),
        v_textos[15]),
    (10, 'Con un solo profesional no se pregunta',
        v_pfin->'form'->>'paso' = 'fecha'
          and v_pfin->'form'->'datos'->>'especialista' = 'Dra. Clemencia Vaquero',
        v_pfin->'form'->>'paso');
end $$;

select n, prueba, case when ok then 'OK' else 'FALLO' end as resultado, detalle from t_res order by n;
rollback;
