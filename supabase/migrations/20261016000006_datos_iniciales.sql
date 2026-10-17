-- 06. Datos iniciales: especialidades y especialistas indicados por la fundación (sin pacientes ni citas).
-- Horarios: 1 = lunes ... 7 = domingo; hora local de Bogotá; bloques de 60 min; sin descanso.

insert into public.specialties (name, slot_minutes) values
  ('Odontología general', 60),
  ('Rehabilitación oral', 60),
  ('Ortodoncia', 60),
  ('Cirugía maxilofacial', 60);

insert into public.specialists (full_name) values
  ('Dr. Jorge Riveros'), ('Dr. Mauricio Guerra'), ('Dra. Paula Vanegas'), ('Dr. Darío Campos');

insert into public.specialist_specialties (specialist_id, specialty_id)
select s.id, y.id from (values
  ('Dr. Jorge Riveros', 'Odontología general'),
  ('Dr. Mauricio Guerra', 'Rehabilitación oral'),
  ('Dra. Paula Vanegas', 'Ortodoncia'),
  ('Dr. Darío Campos', 'Cirugía maxilofacial')
) as m(especialista, especialidad)
join public.specialists s on s.full_name = m.especialista
join public.specialties y on y.name = m.especialidad;

insert into public.weekly_schedules (specialist_id, weekday, start_time, end_time)
select s.id, m.dia, m.inicio::time, m.fin::time from (values
  ('Dr. Jorge Riveros', 2, '09:00', '17:00'),
  ('Dr. Jorge Riveros', 4, '09:00', '17:00'),
  ('Dr. Mauricio Guerra', 1, '09:00', '17:00'),
  ('Dr. Mauricio Guerra', 2, '09:00', '17:00'),
  ('Dr. Mauricio Guerra', 3, '09:00', '17:00'),
  ('Dr. Mauricio Guerra', 4, '09:00', '17:00'),
  ('Dra. Paula Vanegas', 3, '09:00', '12:00'),
  ('Dr. Darío Campos', 6, '09:00', '12:00')
) as m(especialista, dia, inicio, fin)
join public.specialists s on s.full_name = m.especialista;
