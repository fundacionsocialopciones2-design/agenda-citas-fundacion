-- Pruebas de la migración 29 (invitaciones_especialista). No deja datos: el bloque final lanza un error con
-- los resultados, que revierte todo. Especialistas y usuarios ficticios.
begin;

create temp table t_res (n int, prueba text, ok boolean, detalle text);
create temp table t_out (clave text, valor jsonb);
grant all on t_out to authenticated, anon, service_role;

insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'esp.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo.uno@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nuevo.dos@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Especialista Prueba', 'especialista');
insert into public.specialists (id, full_name, active) values
  ('00000000-0000-0000-0000-00000000e001', 'Esp Ficticio Uno', true),
  ('00000000-0000-0000-0000-00000000e002', 'Esp Ficticio Dos', true),
  ('00000000-0000-0000-0000-00000000e003', 'Esp Inactivo', false);

do $$
declare
  e1 uuid := '00000000-0000-0000-0000-00000000e001';
  e2 uuid := '00000000-0000-0000-0000-00000000e002';
  e3 uuid := '00000000-0000-0000-0000-00000000e003';
  admin_claims text := '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  a jsonb; b jsonb; v jsonb; t2 text; v_err text; v_anon text;
begin
  -- Administrador: genera dos veces (la segunda anula la primera)
  set local role authenticated;
  perform set_config('request.jwt.claims', admin_claims, true);
  a := public.admin_crear_invitacion(e1);
  b := public.admin_crear_invitacion(e1);
  insert into t_out values ('a', a), ('b', b), ('inactivo', public.admin_crear_invitacion(e3)),
    ('inexistente', public.admin_crear_invitacion(gen_random_uuid()));
  insert into t_out select 'lista', jsonb_agg(i.specialist_id) from public.admin_invitaciones() i where i.specialist_id in (e1, e2, e3);
  reset role;
  insert into t_out select 'guardado', jsonb_build_object(
      'sin_token', not exists (select 1 from agenda.invitaciones_especialista where token_hash = b->>'token'),
      'con_huella', exists (select 1 from agenda.invitaciones_especialista where token_hash = agenda.huella(b->>'token')));

  -- Edge Function (service_role)
  set local role service_role;
  insert into t_out values
    ('consulta_vieja', public.invitacion_consultar(a->>'token')),
    ('consulta', public.invitacion_consultar(b->>'token')),
    ('consulta_mala', public.invitacion_consultar(repeat('0', 64))),
    ('canje_admin', public.invitacion_canjear(b->>'token', '00000000-0000-0000-0000-0000000000a1')),
    ('canje_fantasma', public.invitacion_canjear(b->>'token', gen_random_uuid())),
    ('canje', public.invitacion_canjear(b->>'token', '00000000-0000-0000-0000-0000000000b1')),
    ('canje_repetido', public.invitacion_canjear(b->>'token', '00000000-0000-0000-0000-0000000000b2'));
  reset role;
  insert into t_out select 'vinculo', jsonb_build_object('rol', p.role, 'correo', p.email, 'nombre', p.full_name, 'enlazado', s.profile_id = p.id)
    from public.specialists s join public.profiles p on p.id = s.profile_id where s.id = e1;

  -- Vencido y anulado
  set local role authenticated;
  perform set_config('request.jwt.claims', admin_claims, true);
  t2 := public.admin_crear_invitacion(e2)->>'token';
  insert into t_out values ('con_acceso', public.admin_crear_invitacion(e1));
  reset role;
  update agenda.invitaciones_especialista set expires_at = now() - interval '1 minute' where specialist_id = e2;
  set local role service_role;
  insert into t_out values ('vencido', public.invitacion_canjear(t2, '00000000-0000-0000-0000-0000000000b2'));
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claims', admin_claims, true);
  t2 := public.admin_crear_invitacion(e2)->>'token';
  insert into t_out values ('anular', public.admin_anular_invitacion(e2)), ('anular_otra_vez', public.admin_anular_invitacion(e2));
  reset role;
  set local role service_role;
  insert into t_out values ('anulado', public.invitacion_consultar(t2));
  reset role;

  -- Permisos
  v := '[]';
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin perform public.admin_crear_invitacion(e2); exception when others then v := v || to_jsonb(sqlerrm); end;
  begin perform public.admin_invitaciones(); exception when others then v := v || to_jsonb(sqlerrm); end;
  begin perform public.admin_anular_invitacion(e2); exception when others then v := v || to_jsonb(sqlerrm); end;
  perform set_config('request.jwt.claims', admin_claims, true);
  begin perform public.invitacion_canjear(repeat('0', 64), gen_random_uuid()); exception when others then v := v || to_jsonb(sqlstate); end;
  begin perform public.invitacion_consultar(repeat('0', 64)); exception when others then v := v || to_jsonb(sqlstate); end;
  begin perform 1 from agenda.invitaciones_especialista; exception when others then v := v || to_jsonb(sqlstate); end;
  reset role;
  set local role anon;
  begin perform public.invitacion_canjear(repeat('0', 64), gen_random_uuid()); exception when others then v := v || to_jsonb(sqlstate); end;
  begin perform public.admin_crear_invitacion(e2); exception when others then v := v || to_jsonb(sqlstate); end;
  reset role;
  insert into t_out values ('permisos', v);
end $$;

create temp view o as select * from t_out;

insert into t_res select 1, 'Genera enlace de 64 caracteres que vence en 72 h',
  valor->>'ok' = 'true' and length(valor->>'token') = 64 and (valor->>'expires_at')::timestamptz = now() + interval '72 hours', null from o where clave = 'b';
insert into t_res select 2, 'En la base solo queda la huella',
  (valor->>'sin_token')::boolean and (valor->>'con_huella')::boolean, valor::text from o where clave = 'guardado';
insert into t_res select 3, 'Generar otro anula el anterior',
  (select valor->>'code' from o where clave = 'consulta_vieja') = 'invitation_invalid'
  and (select valor->>'full_name' from o where clave = 'consulta') = 'Esp Ficticio Uno'
  and (select valor from o where clave = 'lista') = '["00000000-0000-0000-0000-00000000e001"]'::jsonb, null;
insert into t_res select 4, 'Inactivo, inexistente o con acceso → rechazados',
  (select valor->>'code' from o where clave = 'inactivo') = 'specialist_inactive'
  and (select valor->>'code' from o where clave = 'inexistente') = 'specialist_not_found'
  and (select valor->>'code' from o where clave = 'con_acceso') = 'specialist_has_access', null;
insert into t_res select 5, 'No se puede canjear con la cuenta de un administrador ni con un usuario inexistente',
  (select valor->>'code' from o where clave = 'canje_admin') = 'invitation_invalid'
  and (select valor->>'code' from o where clave = 'canje_fantasma') = 'invitation_invalid'
  and (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 'admin', null;
insert into t_res select 6, 'Canje correcto: perfil especialista enlazado a su ficha',
  (select valor->>'ok' from o where clave = 'canje') = 'true'
  and valor->>'rol' = 'especialista' and valor->>'correo' = 'nuevo.uno@example.com'
  and valor->>'nombre' = 'Esp Ficticio Uno' and (valor->>'enlazado')::boolean, valor::text from o where clave = 'vinculo';
insert into t_res select 7, 'Un solo uso',
  valor->>'code' = 'invitation_invalid' and not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b2'), null
  from o where clave = 'canje_repetido';
insert into t_res select 8, 'Vencido y anulado no sirven',
  (select valor->>'code' from o where clave = 'vencido') = 'invitation_invalid'
  and (select valor->>'ok' from o where clave = 'anular') = 'true'
  and (select valor->>'code' from o where clave = 'anular_otra_vez') = 'invitation_not_found'
  and (select valor->>'code' from o where clave = 'anulado') = 'invitation_invalid', null;
insert into t_res select 9, 'Permisos: especialista forbidden; canje y consulta solo service_role; tabla cerrada; anon fuera',
  valor = '["forbidden","forbidden","forbidden","42501","42501","42501","42501","42501"]'::jsonb, valor::text from o where clave = 'permisos';

do $$ begin
  raise exception 'RESULTADOS %', (select json_agg(json_build_object('n', n, 'prueba', prueba,
    'resultado', case when ok then 'OK' else 'FALLO' end, 'detalle', detalle) order by n) from t_res);
end $$;
