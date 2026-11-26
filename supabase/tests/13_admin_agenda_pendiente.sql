-- Pruebas de la migración 24 (admin_agenda_pendiente). No deja datos: begin … rollback.
-- Usa el menú real del bot; las solicitudes son ficticias.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'esp.prueba@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Especialista Prueba', 'especialista');

-- Solicitudes ficticias: 2 citas abiertas (Fonoaudiología pendiente, Fisioterapia contactada),
-- 1 reprogramación sin servicio del menú, y 1 asesoría + 1 urgencia que NO deben aparecer.
insert into public.bot_solicitudes (tipo, telefono, servicio_id, servicio, numero_documento, tipo_documento,
                                    nombre_completo, preferencia, motivo, estado, autoriza_datos_at)
values ('cita', '570000000001', 'sal_fono', 'Fonoaudiología', '9990000001', 'CC', 'Ana Ficticia',
        'martes en la mañana', 'Sin agenda en línea', 'pendiente', now()),
       ('cita', '570000000002', 'sal_fisio', 'Fisioterapia', '9990000002', 'CC', 'Beto Ficticio',
        'viernes 3 pm', 'Atención a domicilio', 'contactado', now()),
       ('cita', '570000000003', null, 'Psicología', '9990000003', 'CC', 'Caro Ficticia',
        'lunes temprano', 'Reprogramar la cita del jueves 26 de noviembre, 8:00 a. m.', 'pendiente', now()),
       ('servicio', '570000000004', 'jur_consultoria', 'Consultoría legal general', '9990000004', 'CC',
        'Dani Ficticio', null, null, 'pendiente', now()),
       ('urgencia', '570000000005', 'urgencias', 'Urgencias de salud', '9990000005', 'CC',
        'Eva Ficticia', null, null, 'pendiente', now());

create temp table t_out (clave text, valor jsonb);
grant all on t_out to authenticated;

do $$
declare
  v_cat jsonb; v_todas jsonb; v_fono jsonb; v_sin jsonb; v_est jsonb; v_doc jsonb;
  v_err_esp text; v_err_anon text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  select jsonb_agg(to_jsonb(c)) into v_cat from public.admin_servicios_cita() c;
  select jsonb_agg(to_jsonb(c)) into v_todas from public.admin_citas_pendientes() c
   where c.numero_documento like '999000000%';
  select jsonb_agg(to_jsonb(c)) into v_fono from public.admin_citas_pendientes('sal_fono') c
   where c.numero_documento like '999000000%';
  select jsonb_agg(to_jsonb(c)) into v_sin from public.admin_citas_pendientes('__sin_servicio') c
   where c.numero_documento like '999000000%';
  select jsonb_agg(to_jsonb(c)) into v_est from public.admin_citas_pendientes(null, 'contactado') c
   where c.numero_documento like '999000000%';
  select jsonb_agg(to_jsonb(c)) into v_doc from public.admin_citas_pendientes(null, null, '9.990.000.001') c;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin
    perform public.admin_citas_pendientes();
  exception when others then v_err_esp := sqlerrm;
  end;
  reset role;

  set local role anon;
  begin
    perform public.admin_servicios_cita();
  exception when others then v_err_anon := sqlstate;
  end;
  reset role;

  insert into t_out values ('cat', v_cat), ('todas', v_todas), ('fono', v_fono), ('sin', v_sin),
                           ('est', v_est), ('doc', v_doc),
                           ('err', jsonb_build_object('esp', v_err_esp, 'anon', v_err_anon));
end $$;

insert into t_res
select 1, 'Solo aparecen las citas abiertas (no asesorías ni urgencias)',
       jsonb_array_length(valor) = 3
         and not exists (select 1 from jsonb_array_elements(valor) e where e->>'nombre_completo' in ('Dani Ficticio', 'Eva Ficticia')),
       jsonb_array_length(valor)::text
  from t_out where clave = 'todas';

insert into t_res
select 2, 'Cada cita trae el día/hora que pidió la persona y el motivo',
       exists (select 1 from jsonb_array_elements(valor) e
                      where e->>'preferencia' = 'martes en la mañana' and e->>'motivo' = 'Sin agenda en línea'),
       null
  from t_out where clave = 'todas';

insert into t_res
select 3, 'Filtro por servicio (Fonoaudiología)',
       jsonb_array_length(valor) = 1 and valor->0->>'nombre_completo' = 'Ana Ficticia'
         and valor->0->>'servicio' = (select titulo from public.bot_nodos where id = 'sal_fono'),
       valor->0->>'servicio'
  from t_out where clave = 'fono';

insert into t_res
select 4, 'Filtro «Sin servicio del menú» (reprogramaciones)',
       jsonb_array_length(valor) = 1 and valor->0->>'nombre_completo' = 'Caro Ficticia'
         and valor->0->>'servicio' = 'Psicología',
       null
  from t_out where clave = 'sin';

insert into t_res
select 5, 'Filtro por estado', jsonb_array_length(valor) = 1 and valor->0->>'nombre_completo' = 'Beto Ficticio', null
  from t_out where clave = 'est';

insert into t_res
select 6, 'Búsqueda por documento con puntos', jsonb_array_length(valor) = 1 and valor->0->>'nombre_completo' = 'Ana Ficticia', null
  from t_out where clave = 'doc';

insert into t_res
select 7, 'Catálogo: Fonoaudiología, Optometría y Fisioterapia sin agenda en línea; Psicología con agenda',
       exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = 'sal_fono'
                 and (e->>'agenda_en_linea')::boolean = false and (e->>'pendientes')::int >= 1)
         and exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = 'sal_optometria'
                       and (e->>'agenda_en_linea')::boolean = false)
         and exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = 'sal_fisio'
                       and (e->>'agenda_en_linea')::boolean = false and (e->>'pendientes')::int = 0
                       and (e->>'solicitudes')::int >= 1)
         and exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = 'sal_mental'
                       and (e->>'agenda_en_linea')::boolean = true)
         and exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = '__sin_servicio'),
       null
  from t_out where clave = 'cat';

insert into t_res
select 8, 'Catálogo: los servicios sin agenda van primero; odontología agrupada',
       (valor->0->>'agenda_en_linea')::boolean = false
         and exists (select 1 from jsonb_array_elements(valor) e where e->>'servicio_id' = 'odo_periodoncia'
                       and e->>'grupo' = (select titulo from public.bot_nodos where id = 'sal_odontologia')),
       valor->0->>'titulo'
  from t_out where clave = 'cat';

insert into t_res
select 9, 'Especialista → forbidden; anon sin permiso (42501)',
       valor->>'esp' = 'forbidden' and valor->>'anon' = '42501', valor::text
  from t_out where clave = 'err';

select n, prueba, case when ok then 'OK' else 'FALLO' end as resultado, detalle from t_res order by n;
rollback;
