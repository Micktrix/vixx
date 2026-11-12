-- Elevdelen, trin E2: hold og elever (12. nov. 2026).
-- Elever er IKKE medlemmer i school_members: så ville de via "medlemmer ser …"-reglerne kunne se lærere,
-- bookinger og løn. De har deres egen tabel og ser kun deres egen profil, deres hold og skolens forløb.
-- Kontoret (admin og office) opretter og retter hold og elever. Lærerne kan se skolens elever (til
-- QR-kvittering i trin E3). Eleven logger ind med telefonnummeret som lærerne.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  course_id uuid,                       -- holdets forløb (valgfrit); eleven kan have sit eget
  starts_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, course_id) references public.courses (school_id, id),
  unique (school_id, name),
  unique (school_id, id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  team_id uuid,
  course_id uuid not null,
  service_id uuid,                      -- ydelsen til lønnen, når en kørselslektion kvitteres (trin E3)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, team_id) references public.teams (school_id, id),
  foreign key (school_id, course_id) references public.courses (school_id, id),
  foreign key (school_id, service_id) references public.services (school_id, id),
  unique (school_id, user_id),
  unique (school_id, id)
);
create index students_team_idx on public.students (team_id);
create index students_course_idx on public.students (course_id);
create index students_user_idx on public.students (user_id);
create index teams_course_idx on public.teams (course_id);

-- Er den indloggede bruger aktiv elev på skolen?
create function private.is_student(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.school_id = p_school and s.user_id = (select auth.uid()) and s.active
  );
$$;

-- Må den indloggede bruger se denne persons profil som elev på en af sine skoler?
create function private.is_member_for_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.user_id = p_user and private.is_member(s.school_id)
  );
$$;

create function private.is_staff_for_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.user_id = p_user and private.is_staff(s.school_id)
  );
$$;

revoke all on function private.is_student(uuid), private.is_member_for_student(uuid), private.is_staff_for_student(uuid)
  from public, anon;
grant execute on function private.is_student(uuid), private.is_member_for_student(uuid), private.is_staff_for_student(uuid)
  to authenticated, service_role;

alter table public.teams enable row level security;
alter table public.students enable row level security;
revoke all on public.teams, public.students from anon, authenticated;
grant select, insert, update, delete on public.teams, public.students to authenticated;
grant all on public.teams, public.students to service_role;

create policy "Skolen ser hold, eleven sit eget" on public.teams
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.team_id = teams.id and s.user_id = (select auth.uid()) and s.active)
  );
create policy "Kontoret opretter hold" on public.teams
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter hold" on public.teams
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
create policy "Kontoret sletter hold" on public.teams
  for delete to authenticated using (private.is_staff(school_id));

create policy "Skolen ser elever, eleven sig selv" on public.students
  for select to authenticated using (private.is_member(school_id) or user_id = (select auth.uid()));
create policy "Kontoret opretter elever" on public.students
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter elever" on public.students
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
create policy "Kontoret sletter elever" on public.students
  for delete to authenticated using (private.is_staff(school_id));

-- Elevens profil: skolens folk kan se den, kontoret kan rette navnet.
create policy "Skolen ser elevers profiler" on public.profiles
  for select to authenticated using (private.is_member_for_student(id));
create policy "Kontoret retter elevers profiler" on public.profiles
  for update to authenticated using (private.is_staff_for_student(id)) with check (private.is_staff_for_student(id));

-- Eleven ser sin skoles navn og forløbene (ikke resten af skolens data).
create policy "Elever ser egen skole" on public.schools
  for select to authenticated using (private.is_student(id));
create policy "Elever ser forløb" on public.courses
  for select to authenticated using (private.is_student(school_id));
create policy "Elever ser forløbets lektioner" on public.course_lessons
  for select to authenticated using (private.is_student(school_id));

create trigger write_audit after insert or update or delete on public.teams
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.students
  for each row execute function private.write_audit();
