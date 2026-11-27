-- Pruebas de la migración 28 (admin_inicio). No deja datos: el bloque final lanza un error con los
-- resultados, que revierte todo. Compara las cifras antes y después de agregar datos ficticios.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);
create temp table t_out (clave text, valor jsonb);
grant all on t_out to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'esp.prueba@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Especialista Prueba', 'especialista');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into t_out select 'antes', public.admin_inicio();
reset role;

insert into public.bot_solicitudes (tipo, telefono, servicio, nombre_completo, estado, autoriza_datos_at, creado)
values ('urgencia', '570000000001', 'x', 'Prueba U', 'pendiente', now(), now() - interval '400 days'),
       ('urgencia', '570000000001', 'x', 'Prueba U2', 'contactado', now(), now()),
       ('cita', '570000000001', 'x', 'Prueba C', 'pendiente', now(), now()),
       ('cita', '570000000001', 'x', 'Prueba C2', 'atendida', now(), now()),
       ('servicio', '570000000001', 'x', 'Prueba S', 'pendiente', now(), now());
insert into public.bot_inscripciones (telefono, curso, nombre_completo, tipo_documento, numero_documento,
                                      telefono_contacto, correo, ciudad, modalidad, estado, autoriza_datos_at)
select '570000000001', 'Curso x', 'Prueba I', 'CC', '9990000001', '3000000000', 'x@example.com', 'Bogotá', 'Virtual',
       e, now()
  from unnest(array['pendiente', 'matriculado']) e;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into t_out select 'despues', public.admin_inicio();
reset role;

do $$
declare v_esp text; v_anon text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin perform public.admin_inicio(); exception when others then v_esp := sqlerrm; end;
  reset role;
  set local role anon;
  begin perform public.admin_inicio(); exception when others then v_anon := sqlstate; end;
  reset role;
  insert into t_out values ('err', jsonb_build_object('esp', v_esp, 'anon', v_anon));
end $$;

insert into t_res
select 1, 'Cada cifra cuenta solo lo pendiente de su tipo (+1)',
       bool_and((d.valor->k->>'total')::int = (a.valor->k->>'total')::int + 1),
       string_agg(k || ' ' || (a.valor->k->>'total') || '→' || (d.valor->k->>'total'), ', ')
  from t_out a, t_out d, unnest(array['urgencias', 'citas_pendientes', 'asesorias', 'inscripciones']) k
 where a.clave = 'antes' and d.clave = 'despues';
insert into t_res
select 2, 'La más antigua es la fecha de la solicitud pendiente más vieja',
       (valor->'urgencias'->>'mas_antigua')::timestamptz = now() - interval '400 days', valor->'urgencias'->>'mas_antigua'
  from t_out where clave = 'despues';
insert into t_res
select 3, 'Citas de hoy = no canceladas del día en Bogotá',
       (valor->'citas_hoy'->>'total')::int = (select count(*) from public.appointments a
          where a.status <> 'cancelada'
            and (a.starts_at at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date)
         and valor->>'hoy' = ((now() at time zone 'America/Bogota')::date)::text,
       valor->'citas_hoy'::text
  from t_out where clave = 'despues';
insert into t_res
select 4, 'Especialista → forbidden; anon sin permiso (42501)',
       valor->>'esp' = 'forbidden' and valor->>'anon' = '42501', valor::text
  from t_out where clave = 'err';

do $$ begin
  raise exception 'RESULTADOS %', (select json_agg(json_build_object('n', n, 'prueba', prueba,
    'resultado', case when ok then 'OK' else 'FALLO' end, 'detalle', detalle) order by n) from t_res);
end $$;
