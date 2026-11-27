-- Migración 28 · admin_inicio (26 nov 2026)
-- Cifras de la pantalla «Inicio» del administrador: lo pendiente por gestionar y las citas de hoy
-- (hora de Bogotá). Solo lectura, sin tablas nuevas y sin tocar las bot_*.

create or replace function public.admin_inicio()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_res jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  with sol as (
    select s.tipo, count(*) as total, min(s.creado) as mas_antigua
      from public.bot_solicitudes s where s.estado = 'pendiente' group by s.tipo
  ), ins as (
    select count(*) as total, min(i.creado) as mas_antigua
      from public.bot_inscripciones i where i.estado = 'pendiente'
  ), hoy as (
    select count(*) as total,
           count(*) filter (where a.status = 'confirmada' and a.ends_at > now()) as por_atender
      from public.appointments a
     where a.status <> 'cancelada'
       and a.starts_at >= (v_hoy::timestamp at time zone 'America/Bogota')
       and a.starts_at <  ((v_hoy + 1)::timestamp at time zone 'America/Bogota')
  )
  select jsonb_build_object(
    'hoy', v_hoy,
    'urgencias', (select jsonb_build_object('total', coalesce(sum(total), 0), 'mas_antigua', min(mas_antigua))
                    from sol where tipo = 'urgencia'),
    'citas_pendientes', (select jsonb_build_object('total', coalesce(sum(total), 0), 'mas_antigua', min(mas_antigua))
                           from sol where tipo = 'cita'),
    'asesorias', (select jsonb_build_object('total', coalesce(sum(total), 0), 'mas_antigua', min(mas_antigua))
                    from sol where tipo = 'servicio'),
    'inscripciones', (select jsonb_build_object('total', total, 'mas_antigua', mas_antigua) from ins),
    'citas_hoy', (select jsonb_build_object('total', total, 'por_atender', por_atender) from hoy))
    into v_res;
  return v_res;
end $$;

revoke all on function public.admin_inicio() from public, anon;
grant execute on function public.admin_inicio() to authenticated;
