-- Pruebas de la migración 23 (bot_reservas_con_reglas_de_agenda). No deja datos: begin … rollback.
-- Especialistas reales (Psicología: Orquídea Chaparro; Periodoncia: Clemencia Vaquero); paciente,
-- documentos y teléfono ficticios.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);
create temp table t_ctx as
select (select id from public.specialties where name = 'Psicología')  as psico,
       (select id from public.specialties where name = 'Periodoncia') as perio,
       (select id from public.specialists where full_name = 'Orquídea Chaparro') as orquidea,
       (select id from public.specialists where full_name = 'Dra. Clemencia Vaquero') as clemencia,
       (public.bot_tipos_documento())[1] as tdoc;
grant select on t_ctx to service_role;
create temp table t_out (clave text, valor text);
grant all on t_out to service_role;

do $$
declare
  c        record;
  v_tel    text := '570000000099';
  v_doc    text := '9990001112';
  v_msg    text;
  v_a      text[] := '{}';
  v_b      text[] := '{}';
  v_pid    uuid;
  v_cita_a uuid;
  v_cita_b uuid;
  v_slot   timestamptz;
  v_r3     jsonb;
  v_r3b    jsonb;
  v_ocup   jsonb;
  v_rep    jsonb;
  v_rep_x  jsonb;
  v_gp     jsonb;
  v_fg     jsonb;
  v_err    text;
begin
  select * into c from t_ctx;
  set local role service_role;
  begin
    -- A. Paciente nuevo agenda Psicología con Orquídea por WhatsApp
    foreach v_msg in array array['hola', '2', '3', '1', v_doc, '1', '1', 'Prueba', 'Ficticia',
                                 '1', '1', '2', '1', '1', '1']
    loop
      v_a := v_a || coalesce(public.bot_responder(v_tel, v_msg, 'Prueba')->>'texto', '');
    end loop;
    -- B. El mismo paciente agenda OTRA cita de Psicología (la regla «una por especialidad» no aplica al bot)
    foreach v_msg in array array['hola', '2', '3', '1', v_doc, '1', '2', '1', '1', '1']
    loop
      v_b := v_b || coalesce(public.bot_responder(v_tel, v_msg, 'Prueba')->>'texto', '');
    end loop;
    select id into v_pid from public.patients where document_number = v_doc;
    select id into v_cita_a from public.appointments where patient_id = v_pid and status = 'confirmada' order by starts_at limit 1;
    select id into v_cita_b from public.appointments where patient_id = v_pid and status = 'confirmada' order by starts_at desc limit 1;

    -- C. Tercera cita (Periodoncia) desde el mismo teléfono: sin límite de 2; y reintento idempotente
    v_slot := (public.bot_horas_libres(c.perio, (public.bot_fechas_libres(c.perio, c.clemencia)->>0)::date, c.clemencia)->0->>'inicio')::timestamptz;
    v_r3  := public.bot_reservar_cita(v_pid, c.clemencia, c.perio, v_slot, 'wa-prueba-clave-3');
    v_r3b := public.bot_reservar_cita(v_pid, c.clemencia, c.perio, v_slot, 'wa-prueba-clave-3');
    -- D. Horario ya ocupado
    v_ocup := public.bot_reservar_cita(v_pid, c.clemencia, c.perio, v_slot, 'wa-prueba-clave-4');
    -- E. Reprogramar la cita A con la misma profesional; y con un documento ajeno
    v_slot := (public.bot_horas_libres(c.psico, (public.bot_fechas_libres(c.psico, c.orquidea)->>2)::date, c.orquidea)->0->>'inicio')::timestamptz;
    v_rep_x := public.bot_reprogramar_cita(v_cita_a, '1234567', v_slot);
    v_rep   := public.bot_reprogramar_cita(v_cita_a, v_doc, v_slot);
    -- F. Las horas para reprogramar son solo de la profesional de la cita
    v_gp := public.bot_gestion_pregunta(jsonb_build_object(
              'tipo', 'gestion', 'paso', 'g_hora', 'tel', v_tel, 'doc', v_doc,
              'fecha', public.bot_fechas_libres(c.psico, c.orquidea)->>0,
              'item', jsonb_build_object('clase', 'cita', 'id', v_cita_b, 'specialty_id', c.psico,
                                         'servicio', 'Psicología')), null);
    -- G. Reserva que falla (clave ya usada por otra cita): no deja paciente y no guarda el error de Postgres
    v_slot := (public.bot_horas_libres(c.psico, (public.bot_fechas_libres(c.psico, c.orquidea)->>3)::date, c.orquidea)->0->>'inicio')::timestamptz;
    v_fg := public.bot_form_guardar('570000000098', jsonb_build_object(
              'tipo', 'cita', 'nodo', 'sal_mental', 'servicio', 'Salud mental y psicología',
              'especialidad_id', c.psico, 'clave', 'prueba-clave-3',
              'datos', jsonb_build_object('tipo_doc', c.tdoc, 'num_doc', '9990002223', 'nombres', 'Otra',
                                          'apellidos', 'Prueba', 'telefono', '+570000000098',
                                          'consentimiento', now(), 'modalidad', 'En sede',
                                          'fecha', (v_slot at time zone 'America/Bogota')::date,
                                          'inicio', v_slot, 'especialista_id', c.orquidea,
                                          'especialista', 'Orquídea Chaparro')));
    insert into t_out values ('a15', v_a[15]), ('b10', v_b[10]), ('r3', v_r3::text), ('r3b', v_r3b::text),
                             ('ocup', v_ocup::text), ('rep', v_rep::text), ('rep_x', v_rep_x::text),
                             ('gp', (v_gp->'form'->'horas')::text), ('fg', v_fg->'r'->>'encabezado'),
                             ('pid', v_pid::text), ('cita_a', v_cita_a::text), ('cita_b', v_cita_b::text);
  exception when others then
    v_err := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  insert into t_res values (1, 'service_role ejecuta todo sin error', v_err is null, v_err);
end $$;

insert into t_res
select 2, 'Conversación A agenda con Orquídea',
       (select valor from t_out where clave = 'a15') like '%quedó agendada%Orquídea Chaparro%',
       (select valor from t_out where clave = 'a15');

insert into t_res
select 3, 'Sin «una por especialidad» en el bot: 2.ª cita de Psicología',
       (select valor from t_out where clave = 'b10') like '%quedó agendada%'
         and (select count(*) from public.appointments a join t_ctx on true
               where a.patient_id = (select valor::uuid from t_out where clave = 'pid')
                 and a.specialty_id = t_ctx.psico and a.status = 'confirmada' and a.starts_at > now()) = 2,
       (select valor from t_out where clave = 'b10');

insert into t_res
select 4, 'Sin límite de 2 por teléfono: 3.ª cita activa',
       ((select valor from t_out where clave = 'r3')::jsonb->>'ok')::boolean
         and ((select valor from t_out where clave = 'r3')::jsonb->>'replayed')::boolean = false,
       (select valor from t_out where clave = 'r3')::jsonb->>'code';

insert into t_res
select 5, 'Reintento con la misma clave no duplica',
       ((select valor from t_out where clave = 'r3b')::jsonb->>'replayed')::boolean
         and (select count(*) from public.appointments where idempotency_key = 'wa-prueba-clave-3') = 1,
       null;

insert into t_res
select 6, 'Horario ocupado → slot_unavailable',
       (select valor from t_out where clave = 'ocup')::jsonb->>'code' = 'slot_unavailable',
       (select valor from t_out where clave = 'ocup');

insert into t_res
select 7, 'Las citas del bot tienen origen whatsapp y clave wa-',
       not exists (select 1 from public.appointments
                    where patient_id = (select valor::uuid from t_out where clave = 'pid')
                      and rescheduled_from is null   -- agenda.reschedule no pone clave a la cita nueva
                      and (source <> 'whatsapp' or idempotency_key is null or idempotency_key not like 'wa-%')),
       null;

insert into t_res
select 8, 'Reprogramar: documento ajeno → not_found',
       (select valor from t_out where clave = 'rep_x')::jsonb->>'code' = 'not_found',
       (select valor from t_out where clave = 'rep_x');

insert into t_res
select 9, 'Reprogramar con agenda.reschedule (misma profesional, anterior cancelada)',
       ((select valor from t_out where clave = 'rep')::jsonb->>'ok')::boolean
         and exists (select 1 from public.appointments a join t_ctx on true
                      where a.id = (select valor::uuid from t_out where clave = 'cita_a')
                        and a.status = 'cancelada' and a.cancel_reason = 'reprogramada')
         and exists (select 1 from public.appointments a join t_ctx on true
                      where a.rescheduled_from = (select valor::uuid from t_out where clave = 'cita_a')
                        and a.status = 'confirmada' and a.specialist_id = t_ctx.orquidea),
       (select valor from t_out where clave = 'rep')::jsonb->>'code';

insert into t_res
select 10, 'Horas para reprogramar: solo la profesional de la cita',
       jsonb_array_length((select valor from t_out where clave = 'gp')::jsonb) > 0
         and not exists (select 1 from jsonb_array_elements((select valor from t_out where clave = 'gp')::jsonb) h, t_ctx
                          where h->>'especialista_id' <> t_ctx.orquidea::text),
       null;

insert into t_res
select 11, 'Reserva fallida: sin paciente residual y motivo sin texto de Postgres',
       not exists (select 1 from public.patients where document_number = '9990002223')
         and exists (select 1 from public.bot_solicitudes where numero_documento = '9990002223'
                       and motivo = 'Error al agendar automáticamente'),
       (select valor from t_out where clave = 'fg');

-- La regla «una por especialidad» sigue para el administrador (agenda.book)
insert into t_res
select 12, 'Administrador conserva «una cita activa por especialidad»',
       agenda.book((select valor::uuid from t_out where clave = 'pid'), t_ctx.orquidea, t_ctx.psico,
                   (public.bot_horas_libres(t_ctx.psico, (public.bot_fechas_libres(t_ctx.psico, t_ctx.orquidea)->>4)::date,
                                            t_ctx.orquidea)->0->>'inicio')::timestamptz,
                   'dashboard', null, null, interval '0', interval '365 days')->>'code' = 'patient_has_active_appointment',
       null
  from t_ctx;

insert into t_res
select 13, 'anon/authenticated no ejecutan los envoltorios nuevos',
       not bool_or(has_function_privilege(r, f, 'execute')),
       string_agg(r || ':' || f, ', ') filter (where has_function_privilege(r, f, 'execute'))
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.bot_reservar_cita(uuid,uuid,uuid,timestamptz,text)',
                    'public.bot_reprogramar_cita(uuid,text,timestamptz)']) f;

select n, prueba, case when ok then 'OK' else 'FALLO' end as resultado, detalle from t_res order by n;
rollback;
