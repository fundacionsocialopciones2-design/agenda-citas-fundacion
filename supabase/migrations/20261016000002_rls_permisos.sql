-- 02. Funciones de rol, RLS y permisos mínimos.
-- Los roles solo los asigna el servidor (service_role): ningún usuario puede escribir profiles ni appointments directamente.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.active
  )
$$;

create function public.my_specialist_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id
  from public.specialists s
  join public.profiles p on p.id = s.profile_id
  where s.profile_id = (select auth.uid()) and s.active and p.active and p.role = 'especialista'
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.my_specialist_id() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.my_specialist_id() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.specialties enable row level security;
alter table public.specialists enable row level security;
alter table public.specialist_specialties enable row level security;
alter table public.patients enable row level security;
alter table public.weekly_schedules enable row level security;
alter table public.time_blocks enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_log enable row level security;
alter table public.documentos_fundacion enable row level security;

-- Privilegios: anon no toca nada; authenticated solo lo necesario (RLS filtra filas).
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.specialties, public.specialists, public.specialist_specialties,
  public.patients, public.weekly_schedules, public.time_blocks, public.appointments, public.audit_log to authenticated;
grant insert, update, delete on public.specialties, public.specialists, public.specialist_specialties,
  public.weekly_schedules, public.time_blocks to authenticated;
grant insert, update on public.patients to authenticated;
grant usage on all sequences in schema public to service_role;
grant all on all tables in schema public to service_role;

-- profiles: cada quien ve el suyo; admin ve todos. Sin escritura desde clientes.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- specialties: cualquier usuario autenticado lee; admin escribe.
create policy specialties_select on public.specialties for select to authenticated using (true);
create policy specialties_admin_write on public.specialties for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- specialists: admin todo; especialista solo su registro.
create policy specialists_select on public.specialists for select to authenticated
  using ((select public.is_admin()) or id = (select public.my_specialist_id()));
create policy specialists_admin_write on public.specialists for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy spec_spec_select on public.specialist_specialties for select to authenticated
  using ((select public.is_admin()) or specialist_id = (select public.my_specialist_id()));
create policy spec_spec_admin_write on public.specialist_specialties for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- patients: solo administración. El especialista obtiene datos mínimos vía my_agenda().
create policy patients_admin_select on public.patients for select to authenticated using ((select public.is_admin()));
create policy patients_admin_insert on public.patients for insert to authenticated with check ((select public.is_admin()));
create policy patients_admin_update on public.patients for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- horarios y bloqueos: admin escribe; especialista solo lee los suyos.
create policy sched_select on public.weekly_schedules for select to authenticated
  using ((select public.is_admin()) or specialist_id = (select public.my_specialist_id()));
create policy sched_admin_write on public.weekly_schedules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy blocks_select on public.time_blocks for select to authenticated
  using ((select public.is_admin()) or specialist_id = (select public.my_specialist_id()));
create policy blocks_admin_write on public.time_blocks for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- citas: lectura (admin todas, especialista las suyas). Escritura solo vía funciones RPC.
create policy appointments_select on public.appointments for select to authenticated
  using ((select public.is_admin()) or specialist_id = (select public.my_specialist_id()));

-- auditoría: solo admin lee.
create policy audit_admin_select on public.audit_log for select to authenticated using ((select public.is_admin()));
