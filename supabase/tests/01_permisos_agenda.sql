-- Pruebas SQL: permisos/RLS, disponibilidad, reservas, idempotencia, cancelación, reprogramación y conflictos.
-- Datos ficticios. Todo ocurre en una transacción que termina en ROLLBACK (no deja datos).
-- Ejecutar con: psql / SQL editor de Supabase (rol postgres). Resultado: tabla t_res (prueba, ok, detalle).

begin;
create temp table t_res (n serial, prueba text, ok boolean, detalle text);

-- Fixtures ------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'riveros.prueba@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guerra.prueba@example.com');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Admin Prueba', 'admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Riveros Prueba', 'especialista'),
  ('00000000-0000-0000-0000-0000000000a3', 'Guerra Prueba', 'especialista');
update public.specialists set profile_id = '00000000-0000-0000-0000-0000000000a2' where full_name = 'Dr. Jorge Riveros';
update public.specialists set profile_id = '00000000-0000-0000-0000-0000000000a3' where full_name = 'Dr. Mauricio Guerra';

create temp table t_ctx as
select
  (date_trunc('week', now() at time zone 'America/Bogota')::date + 8) as martes,   -- próximo martes (dentro de 30 días)
  (select id from public.specialists where full_name = 'Dr. Jorge Riveros') as riveros,
  (select id from public.specialists where full_name = 'Dr. Mauricio Guerra') as guerra,
  (select id from public.specialties where name = 'Odontología general') as odonto,
  (select id from public.specialties where name = 'Rehabilitación oral') as rehab,
  agenda.upsert_patient('CC', '1000000001', 'Ana', 'Prueba Uno', '3000000001', true) as p1,
  agenda.upsert_patient('CC', '1000000002', 'Luis', 'Prueba Dos', '3000000002', true) as p2,
  agenda.upsert_patient('CC', '1000000003', 'Eva', 'Prueba Tres', '3000000001', true) as p3;  -- mismo teléfono que p1

-- Citas base: Riveros martes 10:00 (p1), Guerra martes 10:00 (p2)
select agenda.book(p1, riveros, odonto, (martes + time '10:00') at time zone 'America/Bogota', 'dashboard', null, '00000000-0000-0000-0000-0000000000a1', interval '0', interval '365 days') from t_ctx;
select agenda.book(p2, guerra, rehab, (martes + time '10:00') at time zone 'America/Bogota', 'dashboard', null, '00000000-0000-0000-0000-0000000000a1', interval '0', interval '365 days') from t_ctx;

-- 1. Teléfono compartido no unifica pacientes
insert into t_res (prueba, ok, detalle)
select 'pacientes distintos con mismo teléfono', count(distinct id) = 2, count(distinct id)::text from public.patients where phone = '3000000001';

-- 2. Aislamiento entre especialistas (RLS) ------------------------------------
do $$
declare v_ok boolean; v_d text; v_n int; v_n2 int; v_n3 int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  select count(*) into v_n from public.appointments;
  select count(*) into v_n2 from public.my_agenda(now(), now() + interval '60 days');
  select count(*) into v_n3 from public.patients;
  reset role;
  insert into t_res (prueba, ok, detalle) values
    ('especialista ve solo sus citas (tabla)', v_n = 1, v_n::text),
    ('especialista ve solo sus citas (my_agenda)', v_n2 = 1, v_n2::text),
    ('especialista no lee tabla patients', v_n3 = 0, v_n3::text);
exception when others then reset role; insert into t_res (prueba, ok, detalle) values ('aislamiento RLS', false, sqlerrm);
end $$;

do $$
declare v_d text; v_ok boolean := false; c t_ctx%rowtype;
begin
  select * into c from t_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin
    perform public.admin_book_appointment(c.p3, c.riveros, c.odonto, now() + interval '9 days');
    v_d := 'se permitió';
  exception when others then v_ok := (sqlerrm = 'forbidden'); v_d := sqlerrm; end;
  reset role;
  insert into t_res (prueba, ok, detalle) values ('especialista no puede reservar (admin_*)', v_ok, v_d);
end $$;

do $$
declare v_ok boolean := false; v_d text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2';
    v_d := 'se permitió';
  exception when others then v_ok := (sqlerrm like 'permission denied%' or sqlerrm like 'forbidden%'); v_d := sqlerrm; end;
  reset role;
  insert into t_res (prueba, ok, detalle) values ('usuario no puede asignarse rol admin', v_ok, v_d);
end $$;

do $$
declare v_ok boolean := false; v_d text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  begin
    perform public.bot_list_specialties();
    v_d := 'se permitió';
  exception when others then v_ok := (sqlerrm like 'permission denied for function%'); v_d := sqlerrm; end;
  reset role;
  insert into t_res (prueba, ok, detalle) values ('bot_* no ejecutable por usuarios autenticados', v_ok, v_d);
end $$;

do $$
declare v_ok boolean := false; v_d text;
begin
  set local role anon;
  begin
    perform public.bot_list_specialties();
    v_d := 'se permitió';
  exception when others then v_ok := (sqlerrm like 'permission denied for function%'); v_d := sqlerrm; end;
  reset role;
  insert into t_res (prueba, ok, detalle) values ('bot_* no ejecutable por anon', v_ok, v_d);
end $$;

-- 3. Admin ve todo y puede reservar ------------------------------------------
do $$
declare v_n int; v_r jsonb; c t_ctx%rowtype;
begin
  select * into c from t_ctx;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  select count(*) into v_n from public.appointments;
  v_r := public.admin_book_appointment(c.p3, c.riveros, c.odonto, (c.martes + time '11:00') at time zone 'America/Bogota');
  reset role;
  insert into t_res (prueba, ok, detalle) values
    ('admin ve todas las citas', v_n = 2, v_n::text),
    ('admin reserva cita', (v_r->>'ok')::boolean, v_r::text);
end $$;

-- 4. Reglas de reserva ---------------------------------------------------------
do $$
declare v_r jsonb; c t_ctx%rowtype;
begin
  select * into c from t_ctx;
  -- fuera de horario (martes 18:00)
  v_r := agenda.book(c.p2, c.riveros, c.odonto, (c.martes + time '18:00') at time zone 'America/Bogota', 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values ('rechaza fuera de horario', v_r->>'code' = 'slot_unavailable', v_r::text);
  -- día sin atención (miércoles) para Riveros
  v_r := agenda.book(c.p2, c.riveros, c.odonto, (c.martes + 1 + time '10:00') at time zone 'America/Bogota', 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values ('rechaza día sin horario', v_r->>'code' = 'slot_unavailable', v_r::text);
  -- pasado
  v_r := agenda.book(c.p2, c.riveros, c.odonto, (c.martes - 14 + time '10:00') at time zone 'America/Bogota', 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values ('rechaza fecha pasada', v_r->>'code' = 'slot_unavailable', v_r::text);
  -- mismo cupo ocupado
  v_r := agenda.book(c.p2, c.riveros, c.odonto, (c.martes + time '10:00') at time zone 'America/Bogota', 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values ('rechaza cupo ya ocupado', v_r->>'code' = 'slot_unavailable', v_r::text);
  -- paciente con cita activa en la misma especialidad
  v_r := agenda.book(c.p1, c.riveros, c.odonto, (c.martes + time '12:00') at time zone 'America/Bogota', 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values ('una cita activa por paciente y especialidad', v_r->>'code' = 'patient_has_active_appointment', v_r::text);
  -- más allá de 30 días (bot)
  v_r := agenda.book(c.p2, c.riveros, c.odonto, (c.martes + 35 + time '10:00') at time zone 'America/Bogota', 'whatsapp', null, null, interval '2 hours', interval '30 days');
  insert into t_res (prueba, ok, detalle) values ('bot: rechaza más de 30 días', v_r->>'code' = 'slot_unavailable', v_r::text);
end $$;

-- Restricción de exclusión (última barrera): inserción directa solapada
do $$
declare v_ok boolean := false; v_d text; c t_ctx%rowtype;
begin
  select * into c from t_ctx;
  begin
    insert into public.appointments (patient_id, specialist_id, specialty_id, starts_at, ends_at, source)
    values (c.p2, c.riveros, c.odonto, (c.martes + time '10:30') at time zone 'America/Bogota', (c.martes + time '11:30') at time zone 'America/Bogota', 'dashboard');
    v_d := 'se permitió solapamiento';
  exception when exclusion_violation then v_ok := true; v_d := 'exclusion_violation'; end;
  insert into t_res (prueba, ok, detalle) values ('EXCLUDE impide solapamiento aunque se evada la función', v_ok, v_d);
end $$;

-- 5. Chatbot: consentimiento, validación e idempotencia -----------------------------
do $$
declare v_r1 jsonb; v_r2 jsonb; v_n int; v_c jsonb; c t_ctx%rowtype; v_t timestamptz;
begin
  select * into c from t_ctx;
  v_t := (c.martes + time '14:00') at time zone 'America/Bogota';
  set local role service_role;
  v_c := public.bot_book_appointment('clave-sin-consent-1', c.riveros, c.odonto, v_t, 'CC', '2000000001', 'Nuevo', 'Paciente', null, false);
  v_r1 := public.bot_book_appointment('wamid-prueba-0001:slot14', c.riveros, c.odonto, v_t, 'CC', '2000000001', 'Nuevo', 'Paciente', '3010000000', true);
  v_r2 := public.bot_book_appointment('wamid-prueba-0001:slot14', c.riveros, c.odonto, v_t, 'CC', '2000000001', 'Nuevo', 'Paciente', '3010000000', true);
  reset role;
  select count(*) into v_n from public.appointments where idempotency_key = 'wamid-prueba-0001:slot14';
  insert into t_res (prueba, ok, detalle) values
    ('bot exige consentimiento', v_c->>'code' = 'consent_required', v_c::text),
    ('bot reserva (1.ª llamada)', (v_r1->>'ok')::boolean and not (v_r1->>'replayed')::boolean, v_r1::text),
    ('reintento idempotente no duplica', (v_r2->>'ok')::boolean and (v_r2->>'replayed')::boolean and v_n = 1, v_r2::text || ' filas=' || v_n);
  -- misma clave con otro paciente/horario => rechazo
  set local role service_role;
  v_r2 := public.bot_book_appointment('wamid-prueba-0001:slot14', c.riveros, c.odonto, v_t, 'CC', '2000000009', 'Otra', 'Persona', null, true);
  reset role;
  insert into t_res (prueba, ok, detalle) values ('clave reutilizada por otro paciente se rechaza', v_r2->>'code' = 'idempotency_key_reuse', v_r2::text);
end $$;

-- 6. Disponibilidad: bloqueos y citas la reducen; no hay datos de pacientes -------------
do $$
declare v_before int; v_after int; v_txt text; c t_ctx%rowtype;
begin
  select * into c from t_ctx;
  select count(*) into v_before from agenda.free_slots(c.riveros, c.odonto, (c.martes + time '00:00') at time zone 'America/Bogota', (c.martes + 1 + time '00:00') at time zone 'America/Bogota', '0', '365 days');
  insert into public.time_blocks (specialist_id, kind, starts_at, ends_at) values
    (c.riveros, 'descanso', (c.martes + time '15:00') at time zone 'America/Bogota', (c.martes + time '16:00') at time zone 'America/Bogota');
  select count(*) into v_after from agenda.free_slots(c.riveros, c.odonto, (c.martes + time '00:00') at time zone 'America/Bogota', (c.martes + 1 + time '00:00') at time zone 'America/Bogota', '0', '365 days');
  select public.bot_availability(c.odonto, 30, 50)::text into v_txt;
  insert into t_res (prueba, ok, detalle) values
    ('bloqueo reduce disponibilidad', v_after = v_before - 1, v_before || ' -> ' || v_after),
    ('disponibilidad del bot sin datos de pacientes', v_txt !~* '(1000000|2000000|Prueba|Ana|Luis|phone|document)', left(v_txt, 120));
end $$;

-- 7. Cancelar conserva el registro y libera el cupo -------------------------------------
do $$
declare v_id uuid; v_r jsonb; v_r2 jsonb; v_status text; c t_ctx%rowtype; v_t timestamptz;
begin
  select * into c from t_ctx;
  v_t := (c.martes + time '10:00') at time zone 'America/Bogota';
  select id into v_id from public.appointments where specialist_id = c.riveros and starts_at = v_t and status = 'confirmada';
  v_r := agenda.cancel(v_id, null, 'prueba');
  select status::text into v_status from public.appointments where id = v_id;
  v_r2 := agenda.book(c.p2, c.riveros, c.odonto, v_t, 'dashboard', null, null, interval '0', interval '365 days');
  insert into t_res (prueba, ok, detalle) values
    ('cancelar conserva registro', (v_r->>'ok')::boolean and v_status = 'cancelada', v_status),
    ('cancelar libera el cupo (se puede reservar de nuevo)', (v_r2->>'ok')::boolean, v_r2->>'code');
end $$;

-- 8. Reprogramación atómica --------------------------------------------------------------
do $$
declare c t_ctx%rowtype; v_id uuid; v_r jsonb; v_old text; v_new int;
begin
  select * into c from t_ctx;
  select id into v_id from public.appointments
   where specialist_id = c.riveros and starts_at = (c.martes + time '11:00') at time zone 'America/Bogota' and status = 'confirmada';
  -- a un cupo ocupado (10:00 volvió a reservarse): falla y conserva la anterior
  v_r := agenda.reschedule(v_id, (c.martes + time '10:00') at time zone 'America/Bogota', null, interval '0', interval '365 days');
  select status::text into v_old from public.appointments where id = v_id;
  insert into t_res (prueba, ok, detalle) values ('reprogramar a cupo ocupado falla y conserva la reserva', v_r->>'code' = 'slot_unavailable' and v_old = 'confirmada', v_r::text || ' / ' || v_old);
  -- a un cupo libre (13:00)
  v_r := agenda.reschedule(v_id, (c.martes + time '13:00') at time zone 'America/Bogota', null, interval '0', interval '365 days');
  select status::text into v_old from public.appointments where id = v_id;
  select count(*) into v_new from public.appointments where rescheduled_from = v_id and status = 'confirmada';
  insert into t_res (prueba, ok, detalle) values ('reprogramar a cupo libre: antigua cancelada y nueva enlazada', (v_r->>'ok')::boolean and v_old = 'cancelada' and v_new = 1, v_r::text);
end $$;

-- 9. Conflictos por cambios de horario (se fuerza la comprobación diferida) ---------------
do $$
declare c t_ctx%rowtype; v_ok boolean; v_d text; v_state text;
begin
  select * into c from t_ctx;
  -- 9a. bloqueo sobre cita futura
  v_ok := false;
  begin
    insert into public.time_blocks (specialist_id, kind, starts_at, ends_at) values
      (c.riveros, 'ausencia', (c.martes + time '13:00') at time zone 'America/Bogota', (c.martes + time '14:00') at time zone 'America/Bogota');
    set constraints all immediate;
    v_d := 'se permitió';
  exception when sqlstate 'AG409' then v_ok := true; v_d := sqlerrm; end;
  set constraints all deferred;
  insert into t_res (prueba, ok, detalle) values ('bloqueo sobre cita futura exige resolver conflicto', v_ok, v_d);
  -- 9b. quitar el horario del martes
  v_ok := false;
  begin
    delete from public.weekly_schedules where specialist_id = c.riveros and weekday = 2;
    set constraints all immediate;
    v_d := 'se permitió';
  exception when sqlstate 'AG409' then v_ok := true; v_d := sqlerrm; end;
  set constraints all deferred;
  insert into t_res (prueba, ok, detalle) values ('cambio de horario con citas futuras exige resolver conflicto', v_ok, v_d);
  -- 9c. desactivar especialista
  v_ok := false;
  begin
    update public.specialists set active = false where id = c.riveros;
    set constraints all immediate;
    v_d := 'se permitió';
  exception when sqlstate 'AG409' then v_ok := true; v_d := sqlerrm; end;
  set constraints all deferred;
  insert into t_res (prueba, ok, detalle) values ('desactivar con citas futuras exige resolver conflicto', v_ok, v_d);
  select status::text into v_state from public.appointments where specialist_id = c.riveros and status = 'confirmada' limit 1;
  insert into t_res (prueba, ok, detalle) values ('ninguna cita se canceló en silencio', v_state = 'confirmada', coalesce(v_state, 'ninguna confirmada'));
end $$;

-- 10. Especialista inactivo sin citas: no ofrece cupos --------------------------------------
do $$
declare c t_ctx%rowtype; v_n int;
begin
  select * into c from t_ctx;
  update public.specialists set active = false where id = (select id from public.specialists where full_name = 'Dra. Paula Vanegas');
  set constraints all immediate;
  select jsonb_array_length(public.bot_availability((select id from public.specialties where name = 'Ortodoncia'), 30, 50)->'slots') into v_n;
  insert into t_res (prueba, ok, detalle) values ('especialista inactivo no ofrece cupos', v_n = 0, v_n::text);
end $$;

-- 11. Auditoría sin datos personales ------------------------------------------------------------
insert into t_res (prueba, ok, detalle)
select 'auditoría registra cambios sin PII', count(*) > 5 and bool_and(details::text !~* '(1000000|Prueba|Ana|Luis|phone)'), count(*)::text || ' filas'
from public.audit_log;

select n, prueba, case when ok then 'OK' else 'FALLO' end as resultado, left(detalle, 140) as detalle from t_res order by n;
rollback;
