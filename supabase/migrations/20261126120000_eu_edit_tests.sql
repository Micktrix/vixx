-- Trin E9b (26. nov. 2026): EU-forløbene kan rettes, når admin har låst dem op (emner, mål, beskrivelse, faste timer
-- og køretimer), og skolens nye blanket (PDF) lægges op og gemmes som version. Prøverne lastsikring og Multitest
-- kommer i faktaboksen. Eleven ser sit eget EU-fremskridt i appen.

-- 1. Ret EU-emnerne: kun admin, kun når forløbet er låst op (samme regel som modulerne). Et emne, der er bekræftet
--    på en elev, kan ikke slettes (fremmednøglen), men kan rettes.
grant insert, update, delete on public.eu_topics to authenticated;
create policy "Admin opretter EU-emner" on public.eu_topics
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter EU-emner" on public.eu_topics
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter EU-emner" on public.eu_topics
  for delete to authenticated using (private.is_admin(school_id));
create trigger guard_course_locked before insert or update or delete on public.eu_topics
  for each row execute function private.guard_course_locked();
create trigger write_audit after insert or update or delete on public.eu_topics
  for each row execute function private.write_audit();

-- 2. Skolens EU-blanket (PDF) som versioner. Filen ligger i lageret `module-plan-templates`, som kun serveren tilgår.
create table public.eu_plan_files (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  course_id uuid not null,
  file_name text not null check (length(file_name) between 1 and 200),
  storage_path text not null unique,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index eu_plan_files_course_idx on public.eu_plan_files (course_id);
create index eu_plan_files_school_idx on public.eu_plan_files (school_id);
alter table public.eu_plan_files enable row level security;
revoke all on public.eu_plan_files from anon, authenticated;
grant select, insert on public.eu_plan_files to authenticated;
grant all on public.eu_plan_files to service_role;
create policy "Skolen ser EU-blanketterne" on public.eu_plan_files
  for select to authenticated using (private.is_member(school_id));
create policy "Admin lægger EU-blanket op" on public.eu_plan_files
  for insert to authenticated with check (private.is_admin(school_id));
create trigger guard_course_locked before insert or update or delete on public.eu_plan_files
  for each row execute function private.guard_course_locked();
create trigger write_audit after insert on public.eu_plan_files
  for each row execute function private.write_audit();

-- 3. Prøverne i EU: praktisk prøve i lastsikring (gods) og skriftlig prøve i Multitest.
alter type public.appointment_kind add value if not exists 'lastsikring';
alter type public.appointment_kind add value if not exists 'multitest';

-- 4. Eleven ser sit eget EU-forløbs emner og sine egne bekræftelser (uden underskrifterne).
create policy "Eleven ser sit EU-forløbs emner" on public.eu_topics
  for select to authenticated using (
    course_id in (select s.eu_course_id from public.students s where s.user_id = (select auth.uid()) and s.active)
  );
create policy "Eleven ser sine EU-bekræftelser" on public.eu_signoffs
  for select to authenticated using (
    student_id in (select s.id from public.students s where s.user_id = (select auth.uid()) and s.active)
  );
