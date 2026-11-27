-- Migración 26 · admin_urgencias (26 nov 2026)
-- Pestaña «Urgencias» del administrador sobre las solicitudes del bot (bot_solicitudes, tipo 'urgencia').
-- Sin tablas nuevas y sin tocar el código del bot. Los únicos cambios sobre sus datos son la columna
-- «estado» y las notas de seguimiento (se agregan a «notas», nunca se reemplazan).

-- Regla única de cambio de estado de una solicitud (la usan Agenda pendiente y Urgencias).
create or replace function agenda.cambiar_estado_solicitud(p_id bigint, p_tipo text,
                                                           p_estado_actual text, p_estado text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actual text;
begin
  if p_estado is null or p_estado not in ('pendiente', 'contactado', 'agendada', 'atendida', 'cancelada') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;
  select s.estado into v_actual
    from public.bot_solicitudes s
   where s.id = p_id and s.tipo = p_tipo
     for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'request_not_found'); end if;
  -- Otra persona (o el paciente por WhatsApp) la cambió mientras estaba abierta: no se pisa.
  if v_actual is distinct from p_estado_actual then
    return jsonb_build_object('ok', false, 'code', 'status_changed');
  end if;
  update public.bot_solicitudes set estado = p_estado where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function agenda.cambiar_estado_solicitud(bigint, text, text, text) from public, anon, authenticated;

create or replace function public.admin_cambiar_estado_cita_pendiente(p_id bigint,
                                                                      p_estado_actual text,
                                                                      p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.cambiar_estado_solicitud(p_id, 'cita', p_estado_actual, p_estado);
end $$;

create or replace function public.admin_cambiar_estado_urgencia(p_id bigint,
                                                                p_estado_actual text,
                                                                p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return agenda.cambiar_estado_solicitud(p_id, 'urgencia', p_estado_actual, p_estado);
end $$;

-- Nota de seguimiento: «AAAA-MM-DD HH:MM · Autor: texto», separada con « | » como las que ya escribe el bot.
create or replace function public.admin_agregar_nota_urgencia(p_id bigint, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_texto text := trim(regexp_replace(coalesce(p_nota, ''), '[|]+', '/', 'g'));
  v_autor text;
  v_notas text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_texto = '' then return jsonb_build_object('ok', false, 'code', 'empty_note'); end if;
  if length(v_texto) > 500 then return jsonb_build_object('ok', false, 'code', 'note_too_long'); end if;
  select p.full_name into v_autor from public.profiles p where p.id = (select auth.uid());

  update public.bot_solicitudes s
     set notas = concat_ws(' | ', nullif(s.notas, ''),
                           to_char(now() at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI')
                           || ' · ' || coalesce(v_autor, 'Administración') || ': ' || v_texto)
   where s.id = p_id and s.tipo = 'urgencia'
   returning s.notas into v_notas;
  if not found then return jsonb_build_object('ok', false, 'code', 'request_not_found'); end if;
  return jsonb_build_object('ok', true, 'notas', to_jsonb(string_to_array(v_notas, ' | ')));
end $$;

-- «por_atender»: pendiente/contactado/agendada; primero las sin atender y, en cada grupo, la que más
-- lleva esperando. «historial»: atendida/cancelada, más recientes primero. Máximo 500.
create or replace function public.admin_urgencias(p_vista text default 'por_atender',
                                                  p_busqueda text default null)
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
  v_historial boolean := p_vista = 'historial';
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
       and (s.estado in ('atendida', 'cancelada')) = coalesce(v_historial, false)
       and (v_q is null
            or position(v_q in lower(s.nombre_completo)) > 0
            or (v_doc is not null
                and position(v_doc in regexp_replace(upper(coalesce(s.numero_documento, '')), '[^0-9A-Z]', '', 'g')) > 0))
     order by case when coalesce(v_historial, false) then 0 when s.estado = 'pendiente' then 0 else 1 end,
              case when coalesce(v_historial, false) then s.creado end desc,
              s.creado, s.id
     limit 500;
end $$;

-- Cifras para el contador del menú. «ultima_id» permite notar que llegó una urgencia nueva.
create or replace function public.admin_urgencias_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select jsonb_build_object(
            'sin_atender', count(*) filter (where s.estado = 'pendiente'),
            'en_gestion',  count(*) filter (where s.estado in ('contactado', 'agendada')),
            'ultima_id',   coalesce(max(s.id), 0))
            from public.bot_solicitudes s where s.tipo = 'urgencia');
end $$;

revoke all on function public.admin_cambiar_estado_urgencia(bigint, text, text) from public, anon;
revoke all on function public.admin_agregar_nota_urgencia(bigint, text) from public, anon;
revoke all on function public.admin_urgencias(text, text) from public, anon;
revoke all on function public.admin_urgencias_resumen() from public, anon;
grant execute on function public.admin_cambiar_estado_urgencia(bigint, text, text) to authenticated;
grant execute on function public.admin_agregar_nota_urgencia(bigint, text) to authenticated;
grant execute on function public.admin_urgencias(text, text) to authenticated;
grant execute on function public.admin_urgencias_resumen() to authenticated;
