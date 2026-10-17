-- 01. Tipos y tablas base del sistema de citas.
-- Horarios semanales: weekday ISO (1 = lunes ... 7 = domingo), hora local America/Bogota.
-- Citas: inicio/fin en timestamptz; solo 'confirmada' ocupa agenda.

create extension if not exists btree_gist with schema extensions;

create type public.app_role as enum ('admin', 'especialista');
create type public.appointment_status as enum ('confirmada', 'cancelada', 'asistida', 'no_asistio');
create type public.appointment_source as enum ('whatsapp', 'dashboard');
create type public.block_kind as enum ('descanso', 'vacaciones', 'ausencia', 'otro');
create type public.document_type as enum ('CC', 'TI', 'CE', 'RC', 'PA', 'PPT', 'PEP');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  slot_minutes smallint not null default 60 check (slot_minutes between 15 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.specialists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.specialist_specialties (
  specialist_id uuid not null references public.specialists (id) on delete restrict,
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  primary key (specialist_id, specialty_id)
);
create index on public.specialist_specialties (specialty_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  document_type public.document_type not null,
  document_number text not null check (document_number ~ '^[0-9A-Z]{4,20}$'),
  first_names text not null check (length(trim(first_names)) > 0),
  last_names text not null check (length(trim(last_names)) > 0),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type, document_number)
);

create table public.weekly_schedules (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  constraint weekly_schedules_no_overlap exclude using gist (
    specialist_id extensions.gist_uuid_ops with =,
    weekday extensions.gist_int2_ops with =,
    tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) with &&
  )
);

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists (id) on delete cascade,
  kind public.block_kind not null default 'otro',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (note is null or length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.time_blocks (specialist_id, starts_at);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  specialist_id uuid not null references public.specialists (id) on delete restrict,
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'confirmada',
  source public.appointment_source not null,
  idempotency_key text unique check (idempotency_key is null or length(idempotency_key) between 8 and 128),
  rescheduled_from uuid references public.appointments (id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((status = 'cancelada') = (cancelled_at is not null)),
  constraint appointments_no_overlap exclude using gist (
    specialist_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'confirmada')
);
create index on public.appointments (specialist_id, starts_at);
create index on public.appointments (patient_id);
create index on public.appointments (specialty_id);
create index on public.appointments (rescheduled_from);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_label text not null,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index on public.audit_log (entity, entity_id);
create index on public.audit_log (at desc);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_specialists_updated before update on public.specialists for each row execute function public.set_updated_at();
create trigger trg_patients_updated before update on public.patients for each row execute function public.set_updated_at();
create trigger trg_appointments_updated before update on public.appointments for each row execute function public.set_updated_at();
