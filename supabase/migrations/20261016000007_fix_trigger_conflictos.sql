-- 07. Corrección: trg_assert_no_conflicts fallaba en 'specialists' (la expresión resolvía new.specialist_id
-- en una tabla que no tiene esa columna). Se resuelve el id del especialista vía jsonb.

create or replace function agenda.trg_assert_no_conflicts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := to_jsonb(coalesce(new, old)); v_sp uuid; v_n integer; v_ids text;
begin
  v_sp := (case when tg_table_name = 'specialists' then v_row->>'id' else v_row->>'specialist_id' end)::uuid;
  select count(*), string_agg(c.id::text, ',') into v_n, v_ids from agenda.conflicting_appointments(v_sp) c;
  if v_n > 0 then
    raise exception 'schedule_conflict: % cita(s) futura(s) confirmada(s) quedarían fuera de horario, sobre un bloqueo o con el especialista inactivo. Reprográmalas o cancélalas primero.', v_n
      using errcode = 'AG409', detail = v_ids;
  end if;
  return null;
end $$;
