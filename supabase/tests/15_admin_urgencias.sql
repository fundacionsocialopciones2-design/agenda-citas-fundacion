-- Pruebas de las migraciones 26 y 27 (urgencias). No deja datos: el bloque final lanza un error con
-- los resultados, que revierte todo. Las comprobaciones filtran por los documentos ficticios 99900000xx.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'esp.prueba@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Especialista Prueba', 'especialista');

create temp table t_antes as
select count(*) filter (where estado = 'pendiente') as pend,
       count(*) filter (where estado in ('contactado', 'agendada')) as gest
  from public.bot_solicitudes where tipo = 'urgencia';

insert into public.bot_solicitudes (tipo, prioridad, telefono, servicio_id, servicio, numero_documento, tipo_documento,
                                    nombre_completo, detalle, modalidad, estado, notas, autoriza_datos_at, creado)
values ('urgencia', 'alta', '570000000001', 'urgencias', 'Urgencias de salud', '9990000001', 'CC', 'Ana Ficticia',
        'dolor', 'Voy a la sede', 'pendiente', null, now(), now() - interval '1 hour'),
       ('urgencia', 'alta', '570000000002', 'urgencias', 'Urgencias de salud', '9990000002', 'CC', 'Beto Ficticio',
        'golpe', 'Atención a domicilio', 'pendiente', null, now(), now() - interval '3 hours'),
       ('urgencia', 'alta', '570000000003', 'urgencias', 'Urgencias de salud', '9990000003', 'CC', 'Caro Ficticia',
        'caída', 'Voy a la sede', 'contactado', 'Nota previa del bot', now(), now() - interval '5 hours'),
       ('urgencia', 'alta', '570000000004', 'urgencias', 'Urgencias de salud', '9990000004', 'CC', 'Dani Ficticio',
        'x', 'Voy a la sede', 'atendida', null, now(), now() - interval '2 days'),
       ('cita', 'normal', '570000000005', 'sal_fono', 'Fonoaudiología', '9990000005', 'CC', 'Eva Ficticia',
        null, null, 'pendiente', null, now(), now());

create temp table t_ids as
select (select id from public.bot_solicitudes where numero_documento = '9990000001') as ana,
       (select id from public.bot_solicitudes where numero_documento = '9990000003') as caro,
       (select id from public.bot_solicitudes where numero_documento = '9990000005') as cita;
grant select on t_ids to authenticated, anon;
create temp table t_out (clave text, valor jsonb);
grant all on t_out to authenticated, anon;

do $$
declare
  c record; v jsonb; v_err text; v_anon text;
begin
  select * into c from t_ids;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

  insert into t_out select 'activas', jsonb_agg(u.numero_documento order by u.ord)
    from (select x.numero_documento, row_number() over () as ord from public.admin_urgencias() x) u
   where u.numero_documento like '99900000%';
  insert into t_out select 'historial', jsonb_agg(x.numero_documento)
    from public.admin_urgencias('historial') x where x.numero_documento like '99900000%';
  insert into t_out select 'busqueda', jsonb_agg(x.nombre_completo)
    from public.admin_urgencias('sin_atender', '9.990.000.002') x;
  insert into t_out select 'gestion', jsonb_agg(x.numero_documento)
    from public.admin_urgencias('en_gestion') x where x.numero_documento like '99900000%';
  insert into t_out select 'domicilio', jsonb_agg(x.numero_documento)
    from public.admin_urgencias('sin_atender', null, 'domicilio') x where x.numero_documento like '99900000%';
  insert into t_out select 'sede', jsonb_agg(x.numero_documento)
    from public.admin_urgencias('sin_atender', null, 'sede') x where x.numero_documento like '99900000%';
  insert into t_out values ('resumen', public.admin_urgencias_resumen());

  insert into t_out values
    ('nota', public.admin_agregar_nota_urgencia(c.caro, '  Llamé | sin respuesta  ')),
    ('nota_vacia', public.admin_agregar_nota_urgencia(c.caro, '   ')),
    ('nota_larga', public.admin_agregar_nota_urgencia(c.caro, repeat('a', 501))),
    ('nota_cita', public.admin_agregar_nota_urgencia(c.cita, 'no debe')),
    ('estado', public.admin_cambiar_estado_urgencia(c.ana, 'pendiente', 'atendida')),
    ('estado_viejo', public.admin_cambiar_estado_urgencia(c.ana, 'pendiente', 'contactado')),
    ('estado_cita', public.admin_cambiar_estado_urgencia(c.cita, 'pendiente', 'atendida')),
    ('cita_sigue', public.admin_cambiar_estado_cita_pendiente(c.cita, 'pendiente', 'contactado')),
    ('cita_urg', public.admin_cambiar_estado_cita_pendiente(c.ana, 'atendida', 'pendiente'));
  insert into t_out select 'historial2', jsonb_agg(x.numero_documento)
    from public.admin_urgencias('historial') x where x.numero_documento like '99900000%';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  v := '[]';
  begin perform public.admin_urgencias(); exception when others then v := v || to_jsonb(sqlerrm); end;
  begin perform public.admin_urgencias_resumen(); exception when others then v := v || to_jsonb(sqlerrm); end;
  begin perform public.admin_agregar_nota_urgencia(c.caro, 'x'); exception when others then v := v || to_jsonb(sqlerrm); end;
  begin perform public.admin_cambiar_estado_urgencia(c.caro, 'contactado', 'atendida'); exception when others then v := v || to_jsonb(sqlerrm); end;
  insert into t_out values ('esp', v);
  reset role;

  set local role anon;
  begin perform public.admin_urgencias(); exception when others then v_anon := sqlstate; end;
  reset role;
  insert into t_out values ('anon', to_jsonb(v_anon));
end $$;

insert into t_res select 1, 'Sin atender: primero la que más espera; En gestión aparte',
  valor = '["9990000002","9990000001"]'::jsonb
    and (select valor from t_out where clave = 'gestion') = '["9990000003"]'::jsonb, valor::text from t_out where clave = 'activas';
insert into t_res select 2, 'Historial: solo atendidas y canceladas',
  valor = '["9990000004"]'::jsonb, valor::text from t_out where clave = 'historial';
insert into t_res select 3, 'Búsqueda por documento con puntos',
  valor = '["Beto Ficticio"]'::jsonb, valor::text from t_out where clave = 'busqueda';
insert into t_res select 11, 'Filtro de atención: domicilio y sede',
  (select valor from t_out where clave = 'domicilio') = '["9990000002"]'::jsonb
    and (select valor from t_out where clave = 'sede') = '["9990000001"]'::jsonb, null;
insert into t_res select 4, 'Resumen: +2 sin atender, +1 en gestión',
  (valor->>'sin_atender')::int = a.pend + 2 and (valor->>'en_gestion')::int = a.gest + 1
    and (valor->>'ultima_id')::bigint > 0, valor::text from t_out, t_antes a where clave = 'resumen';
insert into t_res select 5, 'Nota: se agrega con fecha y autor, conserva la anterior y no parte por «|»',
  jsonb_array_length(valor->'notas') = 2 and valor->'notas'->>0 = 'Nota previa del bot'
    and valor->'notas'->>1 ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2} · Admin Prueba: Llamé / sin respuesta$',
  valor::text from t_out where clave = 'nota';
insert into t_res select 6, 'Nota vacía, larga o sobre una cita → rechazada',
  (select valor->>'code' from t_out where clave = 'nota_vacia') = 'empty_note'
    and (select valor->>'code' from t_out where clave = 'nota_larga') = 'note_too_long'
    and (select valor->>'code' from t_out where clave = 'nota_cita') = 'request_not_found'
    and (select notas from public.bot_solicitudes s, t_ids where s.id = t_ids.cita) is null, null;
insert into t_res select 7, 'Cambia a atendida y pasa al historial; estado viejo no pisa',
  (select valor->>'ok' from t_out where clave = 'estado') = 'true'
    and (select valor->>'code' from t_out where clave = 'estado_viejo') = 'status_changed'
    and (select valor from t_out where clave = 'historial2') @> '["9990000001"]'::jsonb, null;
insert into t_res select 8, 'Cada función solo toca su tipo; Agenda pendiente sigue funcionando',
  (select valor->>'code' from t_out where clave = 'estado_cita') = 'request_not_found'
    and (select valor->>'ok' from t_out where clave = 'cita_sigue') = 'true'
    and (select valor->>'code' from t_out where clave = 'cita_urg') = 'request_not_found', null;
insert into t_res select 9, 'Especialista → forbidden en las cuatro',
  valor = '["forbidden","forbidden","forbidden","forbidden"]'::jsonb, valor::text from t_out where clave = 'esp';
insert into t_res select 10, 'anon sin permiso (42501)', valor = '"42501"'::jsonb, valor::text from t_out where clave = 'anon';

do $$ begin
  raise exception 'RESULTADOS %', (select json_agg(json_build_object('n', n, 'prueba', prueba,
    'resultado', case when ok then 'OK' else 'FALLO' end, 'detalle', detalle) order by n) from t_res);
end $$;
