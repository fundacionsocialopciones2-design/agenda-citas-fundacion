-- Migración 27 · urgencias_pestanas_y_atencion (26 nov 2026)
-- Nuevo diseño de «Urgencias» (lista + detalle): tres vistas (sin_atender, en_gestion, historial) y
-- filtro por tipo de atención (sede / domicilio). Cambia la firma de admin_urgencias, creada en la 26.

drop function if exists public.admin_urgencias(text, text);

-- «sin_atender»: pendiente. «en_gestion»: contactado/agendada. «historial»: atendida/cancelada.
-- Las dos primeras ordenan primero la que más lleva esperando; el historial, la más reciente. Máx. 500.
create or replace function public.admin_urgencias(p_vista text default 'sin_atender',
                                                  p_busqueda text default null,
                                                  p_atencion text default null)
returns table(id bigint, creado timestamptz, nombre_completo text, tipo_documento text,
              numero_documento text, telefono text, telefono_contacto text, correo text,
              modalidad text, direccion text, detalle text, estado text, notas text[],
              autoriza_datos_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_estados text[] := case p_vista when 'historial'  then array['atendida', 'cancelada']
                                   when 'en_gestion' then array['contactado', 'agendada']
                                   else array['pendiente'] end;
  v_q   text := nullif(lower(trim(coalesce(p_busqueda, ''))), '');
  v_doc text := nullif(regexp_replace(upper(coalesce(p_busqueda, '')), '[^0-9A-Z]', '', 'g'), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.id, s.creado, s.nombre_completo, s.tipo_documento, s.numero_documento, s.telefono,
           s.telefono_contacto, s.correo, s.modalidad, s.direccion, s.detalle, s.estado,
           coalesce(string_to_array(nullif(s.notas, ''), ' | '), '{}'), s.autoriza_datos_at
      from public.bot_solicitudes s
     where s.tipo = 'urgencia'
       and s.estado = any (v_estados)
       and (p_atencion is null
            or (p_atencion = 'domicilio' and s.modalidad ilike '%domicilio%')
            or (p_atencion = 'sede' and s.modalidad ilike '%sede%'))
       and (v_q is null
            or position(v_q in lower(s.nombre_completo)) > 0
            or (v_doc is not null
                and position(v_doc in regexp_replace(upper(coalesce(s.numero_documento, '')), '[^0-9A-Z]', '', 'g')) > 0))
     order by case when p_vista = 'historial' then s.creado end desc, s.creado, s.id
     limit 500;
end $$;

revoke all on function public.admin_urgencias(text, text, text) from public, anon;
grant execute on function public.admin_urgencias(text, text, text) to authenticated;
