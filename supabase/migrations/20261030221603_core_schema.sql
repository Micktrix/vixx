-- Trin 1: kerneskema for Vixx.
-- Alle forretningstabeller har school_id. Beløb er i øre (heltal). Dato/tid er dansk lokaltid.
-- RLS og politikker ligger i næste migration; rettigheder gives eksplicit nederst i denne fil.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Typer
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'office', 'instructor');
create type public.availability_mode as enum ('fixed', 'on_request');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.absence_reason as enum ('sick', 'off', 'other');
create type public.resource_kind as enum ('room', 'vehicle');
create type public.lesson_origin as enum ('office', 'instructor');
create type public.message_kind as enum ('message', 'notification');

-- ---------------------------------------------------------------------------
-- Fælles for alle skoler
-- ---------------------------------------------------------------------------

-- Kørekortkategorier er ens for alle skoler og vedligeholdes af platformen.
create table public.license_categories (
  code text primary key,
  name text not null,
  sort_order int not null
);

insert into public.license_categories (code, name, sort_order) values
  ('AM', 'Knallert', 10),
  ('A1', 'Lille motorcykel', 20),
  ('A2', 'Mellemstor motorcykel', 30),
  ('A', 'Stor motorcykel', 40),
  ('B', 'Personbil', 50),
  ('BE', 'Personbil med stort påhængskøretøj', 60),
  ('C1', 'Lille lastbil', 70),
  ('C1E', 'Lille lastbil med påhængskøretøj', 80),
  ('C', 'Lastbil', 90),
  ('CE', 'Lastbil med påhængskøretøj', 100),
  ('D1', 'Minibus', 110),
  ('D1E', 'Minibus med påhængskøretøj', 120),
  ('D', 'Bus', 130),
  ('DE', 'Bus med påhængskøretøj', 140);

-- Platformens ejer(e). Ikke en skolerolle.
create table public.platform_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- En person = én login (telefonnummeret er identiteten). En person kan høre til flere skoler.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Skoler og medlemskaber
-- ---------------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lesson_minutes int not null default 45 check (lesson_minutes between 15 and 240),
  pay_period_start_day int not null default 21 check (pay_period_start_day between 1 and 28),
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_members (
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index school_members_user_id_idx on public.school_members (user_id);

-- Typer (Kørsel, Teori, Manøvre, Rybners …) vedligeholdes af hver skole.
create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id)
);

-- ---------------------------------------------------------------------------
-- Undervisere
-- ---------------------------------------------------------------------------
create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  user_id uuid not null,
  employee_number text,
  is_guest boolean not null default false,
  guest_company text,
  active_until date,
  availability public.availability_mode not null default 'fixed',
  -- Kontaktoplysninger (læreren må selv rette disse)
  email text,
  address text,
  postal_code text,
  city text,
  next_of_kin_name text,
  next_of_kin_relation text,
  next_of_kin_phone text,
  -- Stamdata (kun kontoret)
  employed_from date,
  birth_date date,
  instructor_license_expires date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, user_id) references public.school_members (school_id, user_id) on delete cascade,
  unique (school_id, user_id),
  unique (school_id, id),
  unique (school_id, employee_number),
  check (is_guest or guest_company is null)
);
create index instructors_user_id_idx on public.instructors (user_id);

create table public.instructor_categories (
  school_id uuid not null,
  instructor_id uuid not null,
  category_code text not null references public.license_categories (code),
  created_at timestamptz not null default now(),
  primary key (instructor_id, category_code),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade
);
create index instructor_categories_school_id_idx on public.instructor_categories (school_id);

create table public.instructor_lesson_types (
  school_id uuid not null,
  instructor_id uuid not null,
  lesson_type_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, lesson_type_id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  foreign key (school_id, lesson_type_id) references public.lesson_types (school_id, id) on delete cascade
);
create index instructor_lesson_types_school_id_idx on public.instructor_lesson_types (school_id);
create index instructor_lesson_types_type_idx on public.instructor_lesson_types (lesson_type_id);

-- ---------------------------------------------------------------------------
-- Satser, ydelser og priser
-- ---------------------------------------------------------------------------
create table public.rate_groups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null,
  payroll_code text,                -- Dataløn-løndel
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  name text not null,
  rate_group_id uuid not null,
  category_code text not null references public.license_categories (code),
  lesson_type_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id) references public.schools (id) on delete cascade,
  foreign key (school_id, rate_group_id) references public.rate_groups (school_id, id),
  foreign key (school_id, lesson_type_id) references public.lesson_types (school_id, id),
  unique (school_id, name),
  unique (school_id, id)
);
create index services_rate_group_idx on public.services (rate_group_id);
create index services_lesson_type_idx on public.services (lesson_type_id);

-- Pris pr. lektion med gyldig-fra-dato (prishistorik).
create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  service_id uuid not null,
  valid_from date not null,
  amount_ore int not null check (amount_ore >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, service_id) references public.services (school_id, id) on delete cascade,
  unique (service_id, valid_from)
);
create index service_prices_school_id_idx on public.service_prices (school_id);

-- Lærerens egen pris på en ydelse (override).
create table public.instructor_prices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  service_id uuid not null,
  amount_ore int not null check (amount_ore >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  foreign key (school_id, service_id) references public.services (school_id, id) on delete cascade,
  unique (instructor_id, service_id)
);
create index instructor_prices_school_id_idx on public.instructor_prices (school_id);
create index instructor_prices_service_idx on public.instructor_prices (service_id);

-- ---------------------------------------------------------------------------
-- Lektioner og registreringer
-- ---------------------------------------------------------------------------

-- lesson_minutes er længden pr. lektion på oprettelsestidspunktet, så en senere
-- ændring af skolens lektionslængde ikke flytter gamle lektioner.
create table public.scheduled_lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  service_id uuid not null,
  lesson_date date not null,
  start_time time not null,
  lesson_count int not null check (lesson_count between 1 and 20),
  lesson_minutes int not null check (lesson_minutes between 15 and 240),
  end_time time generated always as (start_time + make_interval(mins => lesson_count * lesson_minutes)) stored,
  student_name text,
  student_id uuid,                  -- elevdelen kommer senere
  note text,
  origin public.lesson_origin not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  foreign key (school_id, service_id) references public.services (school_id, id),
  unique (school_id, id),
  check (extract(epoch from start_time) + lesson_count * lesson_minutes * 60 <= 86400)
);
create index scheduled_lessons_school_date_idx on public.scheduled_lessons (school_id, lesson_date);
create index scheduled_lessons_instructor_date_idx on public.scheduled_lessons (instructor_id, lesson_date);
create index scheduled_lessons_service_idx on public.scheduled_lessons (service_id);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  service_id uuid not null,
  scheduled_lesson_id uuid,         -- null = uplanlagt
  lesson_date date not null,
  start_time time not null,
  lesson_count int not null check (lesson_count between 1 and 20),
  lesson_minutes int not null check (lesson_minutes between 15 and 240),
  end_time time generated always as (start_time + make_interval(mins => lesson_count * lesson_minutes)) stored,
  student_name text,
  student_id uuid,
  note text,
  status public.approval_status not null default 'pending',
  decision_comment text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  locked_unit_price_ore int check (locked_unit_price_ore >= 0),  -- låses ved godkendelse
  office_edited_by uuid references auth.users (id) on delete set null,
  office_edited_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  foreign key (school_id, service_id) references public.services (school_id, id),
  foreign key (school_id, scheduled_lesson_id) references public.scheduled_lessons (school_id, id) on delete set null (scheduled_lesson_id),
  check (extract(epoch from start_time) + lesson_count * lesson_minutes * 60 <= 86400),
  check (status <> 'approved' or locked_unit_price_ore is not null)
);
create index registrations_school_date_idx on public.registrations (school_id, lesson_date);
create index registrations_instructor_date_idx on public.registrations (instructor_id, lesson_date);
create index registrations_school_status_idx on public.registrations (school_id, status);
create index registrations_service_idx on public.registrations (service_id);
create index registrations_scheduled_lesson_idx on public.registrations (scheduled_lesson_id);

-- ---------------------------------------------------------------------------
-- Fravær, ferie og tilgængelighed
-- ---------------------------------------------------------------------------
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  absence_date date not null,
  start_time time not null,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  reason public.absence_reason not null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade
);
create index absences_school_date_idx on public.absences (school_id, absence_date);
create index absences_instructor_date_idx on public.absences (instructor_id, absence_date);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  from_date date not null,
  to_date date not null,
  note text,
  status public.approval_status not null default 'pending',
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  check (to_date >= from_date)
);
create index holidays_school_from_idx on public.holidays (school_id, from_date);
create index holidays_instructor_idx on public.holidays (instructor_id);

-- "Kan arbejde" for lærere på "Efter aftale".
create table public.availability (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  available_date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  check (end_time > start_time)
);
create index availability_school_date_idx on public.availability (school_id, available_date);
create index availability_instructor_date_idx on public.availability (instructor_id, available_date);

-- ---------------------------------------------------------------------------
-- Lokaler og køretøjer
-- ---------------------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  kind public.resource_kind not null,
  name text not null,
  vehicle_category_code text references public.license_categories (code),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id),
  check (kind = 'vehicle' or vehicle_category_code is null)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  resource_id uuid not null,
  booking_date date not null,
  start_time time not null,
  minutes int not null check (minutes > 0 and minutes <= 1440),
  title text,
  instructor_id uuid,
  scheduled_lesson_id uuid,         -- følger lektionen; slettes med den
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, resource_id) references public.resources (school_id, id) on delete cascade,
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  foreign key (school_id, scheduled_lesson_id) references public.scheduled_lessons (school_id, id) on delete cascade
);
create index bookings_school_date_idx on public.bookings (school_id, booking_date);
create index bookings_resource_date_idx on public.bookings (resource_id, booking_date);
create index bookings_instructor_idx on public.bookings (instructor_id);
create index bookings_scheduled_lesson_idx on public.bookings (scheduled_lesson_id);

-- ---------------------------------------------------------------------------
-- Lønperioder
-- ---------------------------------------------------------------------------
create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  locked boolean not null default false,
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, starts_on),
  check (ends_on > starts_on)
);

-- ---------------------------------------------------------------------------
-- Beskeder
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  recipient_instructor_id uuid,     -- null = til alle lærere
  kind public.message_kind not null default 'message',
  body text not null,
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, recipient_instructor_id) references public.instructors (school_id, id) on delete cascade,
  unique (school_id, id)
);
create index messages_school_created_idx on public.messages (school_id, created_at desc);
create index messages_recipient_idx on public.messages (recipient_instructor_id);

create table public.message_reads (
  school_id uuid not null,
  message_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id),
  foreign key (school_id, message_id) references public.messages (school_id, id) on delete cascade
);
create index message_reads_user_idx on public.message_reads (user_id);
create index message_reads_school_idx on public.message_reads (school_id);

-- ---------------------------------------------------------------------------
-- Ændringslog (skrives af triggere i en senere migration)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id uuid,
  summary text,
  changes jsonb not null default '{}'
);
create index audit_log_school_time_idx on public.audit_log (school_id, occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

-- ---------------------------------------------------------------------------
-- updated_at og lektionslængde
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'schools', 'school_members', 'lesson_types', 'instructors',
    'rate_groups', 'services', 'service_prices', 'instructor_prices',
    'scheduled_lessons', 'registrations', 'absences', 'holidays', 'availability',
    'resources', 'bookings', 'pay_periods', 'messages'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- Udfylder lektionslængden fra skolen, hvis den ikke er angivet.
create function private.fill_lesson_minutes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_minutes is null then
    select s.lesson_minutes into new.lesson_minutes
    from public.schools s
    where s.id = new.school_id;
  end if;
  return new;
end;
$$;

create trigger fill_lesson_minutes before insert on public.scheduled_lessons
  for each row execute function private.fill_lesson_minutes();
create trigger fill_lesson_minutes before insert on public.registrations
  for each row execute function private.fill_lesson_minutes();

-- ---------------------------------------------------------------------------
-- Rettigheder: kun indloggede brugere når tabellerne, og kun gennem RLS.
-- Gives eksplicit, fordi nye Supabase-projekter ikke længere gør det automatisk.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke insert, update, delete on public.license_categories, public.platform_owners, public.audit_log from authenticated;

revoke all on schema private from public;
revoke all on all functions in schema private from public;
grant usage on schema private to authenticated, service_role;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;
