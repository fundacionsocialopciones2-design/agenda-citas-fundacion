-- Migración 29 · invitaciones_especialista (26 nov 2026)
-- Enlace de invitación para que un especialista sin acceso cree su usuario (decisión del usuario: no se
-- conocen sus correos). El administrador genera un enlace de un solo uso, válido 72 horas, y lo envía por
-- WhatsApp; el especialista escribe su correo y contraseña. La Edge Function «invitacion-especialista»
-- crea el usuario y llama a invitacion_canjear. En la base solo se guarda la huella SHA-256 del enlace.

create table agenda.invitaciones_especialista (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
-- Como máximo un enlace sin usar ni anular por especialista.
create unique index invitaciones_una_abierta on agenda.invitaciones_especialista (specialist_id)
  where used_at is null and revoked_at is null;
create index on agenda.invitaciones_especialista (created_by);
alter table agenda.invitaciones_especialista enable row level security;   -- sin políticas: solo las funciones
revoke all on agenda.invitaciones_especialista from public, anon, authenticated;

create or replace function agenda.huella(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;
revoke all on function agenda.huella(text) from public, anon, authenticated;

-- ---------- Administrador ----------
create or replace function public.admin_crear_invitacion(p_specialist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_esp public.specialists;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_vence timestamptz := now() + interval '72 hours';
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_esp from public.specialists where id = p_specialist_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'specialist_not_found'); end if;
  if not v_esp.active then return jsonb_build_object('ok', false, 'code', 'specialist_inactive'); end if;
  if v_esp.profile_id is not null then return jsonb_build_object('ok', false, 'code', 'specialist_has_access'); end if;

  update agenda.invitaciones_especialista set revoked_at = now()
   where specialist_id = p_specialist_id and used_at is null and revoked_at is null;
  insert into agenda.invitaciones_especialista (specialist_id, token_hash, created_by, expires_at)
  values (p_specialist_id, agenda.huella(v_token), (select auth.uid()), v_vence);
  -- Única vez que el enlace sale de la base de datos.
  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_vence);
end $$;

create or replace function public.admin_anular_invitacion(p_specialist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update agenda.invitaciones_especialista set revoked_at = now()
   where specialist_id = p_specialist_id and used_at is null and revoked_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'invitation_not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Enlaces vigentes (para mostrar «Invitación pendiente» en Especialistas).
create or replace function public.admin_invitaciones()
returns table(specialist_id uuid, expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select i.specialist_id, i.expires_at from agenda.invitaciones_especialista i
     where i.used_at is null and i.revoked_at is null and i.expires_at > now();
end $$;

-- ---------- Solo la Edge Function (service_role). Todo fallo responde igual: no revela la causa ----------
create or replace function public.invitacion_consultar(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  select s.full_name into v_nombre
    from agenda.invitaciones_especialista i
    join public.specialists s on s.id = i.specialist_id
   where i.token_hash = agenda.huella(p_token)
     and i.used_at is null and i.revoked_at is null and i.expires_at > now()
     and s.active and s.profile_id is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'invitation_invalid'); end if;
  return jsonb_build_object('ok', true, 'full_name', v_nombre);
end $$;

-- Vincula el usuario recién creado con el especialista y gasta el enlace, todo o nada.
create or replace function public.invitacion_canjear(p_token text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv agenda.invitaciones_especialista;
  v_esp public.specialists;
  v_correo text;
  c_invalida constant jsonb := jsonb_build_object('ok', false, 'code', 'invitation_invalid');
begin
  select * into v_inv from agenda.invitaciones_especialista
   where token_hash = agenda.huella(p_token) for update;
  if not found or v_inv.used_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    return c_invalida;
  end if;
  select * into v_esp from public.specialists where id = v_inv.specialist_id for update;
  if not v_esp.active or v_esp.profile_id is not null then return c_invalida; end if;

  select u.email into v_correo from auth.users u where u.id = p_user_id;
  -- Nunca se reutiliza una cuenta que ya tenga perfil (por ejemplo, la de un administrador).
  if v_correo is null or exists (select 1 from public.profiles p where p.id = p_user_id) then return c_invalida; end if;

  insert into public.profiles (id, full_name, role, email) values (p_user_id, v_esp.full_name, 'especialista', v_correo);
  update public.specialists set profile_id = p_user_id where id = v_esp.id;
  update agenda.invitaciones_especialista set used_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.admin_crear_invitacion(uuid) from public, anon;
revoke all on function public.admin_anular_invitacion(uuid) from public, anon;
revoke all on function public.admin_invitaciones() from public, anon;
grant execute on function public.admin_crear_invitacion(uuid) to authenticated;
grant execute on function public.admin_anular_invitacion(uuid) to authenticated;
grant execute on function public.admin_invitaciones() to authenticated;
revoke all on function public.invitacion_consultar(text) from public, anon, authenticated;
revoke all on function public.invitacion_canjear(text, uuid) from public, anon, authenticated;
grant execute on function public.invitacion_consultar(text) to service_role;
grant execute on function public.invitacion_canjear(text, uuid) to service_role;
