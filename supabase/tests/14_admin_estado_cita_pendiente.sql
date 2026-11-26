-- Pruebas de la migración 25 (admin_estado_cita_pendiente). No deja datos: el bloque final lanza un
-- error con los resultados, que revierte todo.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'esp.prueba@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Especialista Prueba', 'especialista');

insert into public.bot_solicitudes (tipo, telefono, servicio_id, servicio, numero_documento, tipo_documento,
                                    nombre_completo, preferencia, motivo, estado, autoriza_datos_at)
values ('cita', '570000000001', 'sal_fono', 'Fonoaudiología', '9990000001', 'CC', 'Ana Ficticia',
        'martes en la mañana', 'Sin agenda en línea', 'pendiente', now()),
       ('servicio', '570000000004', 'jur_consultoria', 'Consultoría legal general', '9990000004', 'CC',
        'Dani Ficticio', null, null, 'pendiente', now());

create temp table t_ids as
select (select id from public.bot_solicitudes where numero_documento = '9990000001') as cita,
       (select id from public.bot_solicitudes where numero_documento = '9990000004') as asesoria;
grant select on t_ids to authenticated, anon;
create temp table t_out (clave text, valor text);
grant all on t_out to authenticated, anon;

do $$
declare
  c record; v_ok jsonb; v_stale jsonb; v_bad jsonb; v_ases jsonb; v_none jsonb; v_back jsonb;
  v_esp text; v_anon text;
begin
  select * into c from t_ids;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  v_ok    := public.admin_cambiar_estado_cita_pendiente(c.cita, 'pendiente', 'contactado');
  v_stale := public.admin_cambiar_estado_cita_pendiente(c.cita, 'pendiente', 'atendida');
  v_bad   := public.admin_cambiar_estado_cita_pendiente(c.cita, 'contactado', 'inventado');
  v_ases  := public.admin_cambiar_estado_cita_pendiente(c.asesoria, 'pendiente', 'atendida');
  v_none  := public.admin_cambiar_estado_cita_pendiente(-1, 'pendiente', 'atendida');
  insert into t_out select 'tras_ok', estado from public.admin_citas_pendientes('sal_fono', null, '9990000001');
  v_back  := public.admin_cambiar_estado_cita_pendiente(c.cita, 'contactado', 'pendiente');

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin
    perform public.admin_cambiar_estado_cita_pendiente(c.cita, 'pendiente', 'atendida');
  exception when others then v_esp := sqlerrm;
  end;
  reset role;

  set local role anon;
  begin
    perform public.admin_cambiar_estado_cita_pendiente(c.cita, 'pendiente', 'atendida');
  exception when others then v_anon := sqlstate;
  end;
  reset role;

  insert into t_out values ('ok', v_ok::text), ('stale', v_stale::text), ('bad', v_bad::text),
                           ('ases', v_ases::text), ('none', v_none::text), ('back', v_back::text),
                           ('esp', v_esp), ('anon', v_anon);
end $$;

insert into t_res
select 1, 'Admin cambia pendiente → contactado',
       (select valor from t_out where clave = 'ok')::jsonb->>'ok' = 'true'
         and (select valor from t_out where clave = 'tras_ok') = 'contactado', null;
insert into t_res
select 2, 'Estado desactualizado → status_changed (no pisa)',
       valor::jsonb->>'code' = 'status_changed', valor from t_out where clave = 'stale';
insert into t_res
select 3, 'Estado inventado → invalid_status', valor::jsonb->>'code' = 'invalid_status', valor from t_out where clave = 'bad';
insert into t_res
select 4, 'Una asesoría no se puede cambiar desde aquí',
       (select valor from t_out where clave = 'ases')::jsonb->>'code' = 'request_not_found'
         and (select estado from public.bot_solicitudes s, t_ids where s.id = t_ids.asesoria) = 'pendiente', null;
insert into t_res
select 5, 'Id inexistente → request_not_found', valor::jsonb->>'code' = 'request_not_found', valor from t_out where clave = 'none';
insert into t_res
select 6, 'Se puede devolver a pendiente',
       (select valor from t_out where clave = 'back')::jsonb->>'ok' = 'true'
         and (select estado from public.bot_solicitudes s, t_ids where s.id = t_ids.cita) = 'pendiente', null;
insert into t_res
select 7, 'Especialista → forbidden', valor = 'forbidden', valor from t_out where clave = 'esp';
insert into t_res
select 8, 'anon sin permiso (42501)', valor = '42501', valor from t_out where clave = 'anon';

do $$ begin
  raise exception 'RESULTADOS %', (select json_agg(json_build_object('n', n, 'prueba', prueba,
    'resultado', case when ok then 'OK' else 'FALLO' end, 'detalle', detalle) order by n) from t_res);
end $$;
