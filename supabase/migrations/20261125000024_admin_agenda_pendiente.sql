-- Migración 24 · admin_agenda_pendiente (25 nov 2026)
-- Pestaña «Agenda pendiente» del administrador: citas «abiertas» que el bot guarda cuando el
-- servicio de salud no tiene agenda en línea (la persona escribe el día y la hora que prefiere).
-- El bot las deja en bot_solicitudes con tipo = 'cita' (motivos: «Sin agenda en línea»,
-- «Atención a domicilio», «Error al agendar automáticamente» o una reprogramación sin horarios).
-- Solo lectura, sin tablas nuevas y sin tocar las tablas bot_* (mismo patrón que la migración 21).

-- Servicios de salud del menú del bot: nodos «info» bajo una rama con accion = 'cita'.
create or replace function agenda.servicios_cita_nodos()
returns table(id text, titulo text, grupo text, activo boolean, especialidad text)
language sql
stable
set search_path = ''
as $$
  with recursive rama as (
    select n.id, n.titulo, n.tipo, n.activo, n.accion, n.especialidad, null::text as grupo, 0 as nivel
      from public.bot_nodos n
      left join public.bot_nodos p on p.id = n.padre_id
     where n.accion = 'cita' and coalesce(p.accion, '') <> 'cita'
    union all
    select h.id, h.titulo, h.tipo, h.activo and r.activo, coalesce(h.accion, r.accion),
           coalesce(h.especialidad, r.especialidad),
           case when r.nivel = 0 then null else coalesce(r.grupo, r.titulo) end, r.nivel + 1
      from public.bot_nodos h
      join rama r on h.padre_id = r.id
  )
  select r.id, r.titulo, r.grupo, r.activo, r.especialidad
    from rama r
   where r.tipo = 'info' and r.accion = 'cita';
$$;
revoke all on function agenda.servicios_cita_nodos() from public, anon, authenticated;

-- Catálogo con el número de citas pendientes por servicio y si el servicio agenda en línea.
create or replace function public.admin_servicios_cita()
returns table(servicio_id text, titulo text, grupo text, activo boolean, agenda_en_linea boolean,
              solicitudes bigint, pendientes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    with conteo as (
      select s.servicio_id as sid, count(*) as n, count(*) filter (where s.estado = 'pendiente') as pend,
             max(s.servicio) as serv
        from public.bot_solicitudes s
       where s.tipo = 'cita'
       group by s.servicio_id
    ), nodos as (select * from agenda.servicios_cita_nodos())
    select x.id, x.titulo, x.grupo, x.activo,
           exists (select 1
                     from public.specialties sp
                     join public.specialist_specialties ss on ss.specialty_id = sp.id
                     join public.specialists e on e.id = ss.specialist_id and e.active
                    where sp.active and lower(trim(sp.name)) = lower(trim(x.especialidad))
                      and exists (select 1 from public.weekly_schedules w where w.specialist_id = e.id)),
           coalesce(k.n, 0), coalesce(k.pend, 0)
      from nodos x
      left join conteo k on k.sid = x.id
    union all
    select k.sid, coalesce(b.titulo, k.serv), null, false, false, k.n, k.pend
      from conteo k
      left join public.bot_nodos b on b.id = k.sid
     where k.sid is not null and not exists (select 1 from nodos x where x.id = k.sid)
    union all
    select '__sin_servicio', 'Sin servicio del menú', null, false, false, k.n, k.pend
      from conteo k
     where k.sid is null
    order by 5, 3 nulls first, 2;
end $$;

-- Citas abiertas (máx. 500, más recientes primero), con filtros por servicio, estado y nombre/documento.
create or replace function public.admin_citas_pendientes(p_servicio_id text default null,
                                                         p_estado text default null,
                                                         p_busqueda text default null)
returns table(id bigint, creado timestamptz, servicio_id text, servicio text, grupo text,
              nombre_completo text, tipo_documento text, numero_documento text, telefono text,
              telefono_contacto text, correo text, modalidad text, direccion text, detalle text,
              preferencia text, motivo text, estado text, notas text, autoriza_datos_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q   text := nullif(lower(trim(coalesce(p_busqueda, ''))), '');
  v_doc text := nullif(regexp_replace(upper(coalesce(p_busqueda, '')), '[^0-9A-Z]', '', 'g'), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.id, s.creado, s.servicio_id, coalesce(x.titulo, b.titulo, s.servicio), x.grupo,
           s.nombre_completo, s.tipo_documento, s.numero_documento, s.telefono, s.telefono_contacto,
           s.correo, s.modalidad, s.direccion, s.detalle, s.preferencia, s.motivo, s.estado, s.notas,
           s.autoriza_datos_at
      from public.bot_solicitudes s
      left join agenda.servicios_cita_nodos() x on x.id = s.servicio_id
      left join public.bot_nodos b on b.id = s.servicio_id
     where s.tipo = 'cita'
       and (p_servicio_id is null
            or (p_servicio_id = '__sin_servicio' and s.servicio_id is null)
            or s.servicio_id = p_servicio_id)
       and (p_estado is null or s.estado = p_estado)
       and (v_q is null
            or position(v_q in lower(s.nombre_completo)) > 0
            or (v_doc is not null
                and position(v_doc in regexp_replace(upper(coalesce(s.numero_documento, '')), '[^0-9A-Z]', '', 'g')) > 0))
     order by s.creado desc
     limit 500;
end $$;

revoke all on function public.admin_servicios_cita() from public, anon;
revoke all on function public.admin_citas_pendientes(text, text, text) from public, anon;
grant execute on function public.admin_servicios_cita() to authenticated;
grant execute on function public.admin_citas_pendientes(text, text, text) to authenticated;
