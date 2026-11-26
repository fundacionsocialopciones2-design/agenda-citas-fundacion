-- Migración 25 · admin_estado_cita_pendiente (25 nov 2026)
-- Pedido del usuario: desde «Agenda pendiente» el administrador cambia el estado de cada solicitud
-- para saber cuáles ya gestionó. Solo toca la columna bot_solicitudes.estado de las filas con
-- tipo = 'cita'. No crea citas en la agenda, no avisa al paciente y no modifica el código del bot.
-- Efecto en el bot (sin cambios en él): «Mis citas y trámites» solo lista las solicitudes
-- pendiente / contactado / agendada; atendida y cancelada dejan de mostrarse al paciente.

create or replace function public.admin_cambiar_estado_cita_pendiente(p_id bigint,
                                                                      p_estado_actual text,
                                                                      p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_estado is null or p_estado not in ('pendiente', 'contactado', 'agendada', 'atendida', 'cancelada') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status');
  end if;

  select s.estado into v_actual
    from public.bot_solicitudes s
   where s.id = p_id and s.tipo = 'cita'
     for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'request_not_found'); end if;

  -- Otra persona (o el paciente por WhatsApp) la cambió mientras estaba abierta: no se pisa.
  if v_actual is distinct from p_estado_actual then
    return jsonb_build_object('ok', false, 'code', 'status_changed');
  end if;

  update public.bot_solicitudes set estado = p_estado where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_cambiar_estado_cita_pendiente(bigint, text, text) from public, anon;
grant execute on function public.admin_cambiar_estado_cita_pendiente(bigint, text, text) to authenticated;
