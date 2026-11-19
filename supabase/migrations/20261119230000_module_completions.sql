-- Trin E8, del 4: afslut modul (19. nov. 2026).
-- Læreren afslutter elevens modul ved scanning: flueben ved erklæringen ("eleven har opnået de nødvendige
-- kompetencer …"), evt. selvstudie og "Overført fra lektionsplan". Vixx gemmer dato, lærer, hvem og hvornår,
-- og regner de ekstra lektioner ud (talt i modulet minus minimum). Afslutningen kan aldrig ændres eller slettes.
-- Regler (aftalt med Michael 19. nov. 2026):
--   - Minimum (teori, kørsel, mørke) skal være nået, medmindre modulet er "Overført fra lektionsplan".
--   - Modulerne afsluttes i rækkefølge.
--   - Der kan ikke tælles lektioner i et afsluttet modul (og admin kan ikke flytte tællinger ind eller ud).
-- Underskriften på modulplanen (PDF) kommer i en senere del.

create table public.module_completions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  course_module_id uuid not null references public.course_modules (id),
  module_number int not null,                             -- sættes af Vixx fra modulet
  completed_on date not null default private.today_dk(),
  instructor_id uuid not null,
  instructor_name text not null default '',
  completed_by uuid not null default auth.uid() references auth.users (id),
  completed_at timestamptz not null default now(),
  declaration boolean not null check (declaration),        -- erklæringen skal være sat
  transferred boolean not null default false,              -- "Overført fra lektionsplan"
  self_study text check (char_length(self_study) <= 500),  -- "Antal lektioner og emner (afsnit) gennemført som selvstudie"
  extra_theory int not null default 0,                     -- regnes ud af Vixx
  extra_driving int not null default 0,
  unique (student_id, course_module_id),
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create index module_completions_school_idx on public.module_completions (school_id);
create index module_completions_module_idx on public.module_completions (course_module_id);
create index module_completions_instructor_idx on public.module_completions (instructor_id);

create function private.guard_module_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_module public.course_modules;
  v_theory int;
  v_driving int;
  v_dark int;
begin
  select m.* into v_module
  from public.course_modules m join public.students s on s.course_id = m.course_id
  where m.id = new.course_module_id and s.id = new.student_id and s.school_id = new.school_id and s.active;
  if v_module.id is null then
    raise exception 'Modulet hører ikke til elevens forløb.' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.course_modules m
    where m.course_id = v_module.course_id and m.number < v_module.number
      and not exists (select 1 from public.module_completions c where c.student_id = new.student_id and c.course_module_id = m.id)
  ) then
    raise exception 'Modulerne afsluttes i rækkefølge. Afslut de forrige moduler først.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(lesson_count) filter (where kind = 'theory'), 0),
         coalesce(sum(lesson_count) filter (where kind = 'driving'), 0),
         coalesce(sum(lesson_count) filter (where kind = 'driving' and dark), 0)
    into v_theory, v_driving, v_dark
  from public.module_signoffs
  where student_id = new.student_id and course_module_id = new.course_module_id;

  if not new.transferred
     and (v_theory < v_module.min_theory or v_driving < v_module.min_driving or v_dark < v_module.min_dark) then
    raise exception 'Modulets minimum er ikke nået.' using errcode = 'check_violation';
  end if;

  new.module_number := v_module.number;
  new.extra_theory := greatest(v_theory - v_module.min_theory, 0);
  new.extra_driving := greatest(v_driving - v_module.min_driving, 0);
  new.self_study := nullif(btrim(new.self_study), '');

  if current_user = 'authenticated' then
    if new.instructor_id not in (select private.my_instructor_ids()) then
      raise exception 'Du kan kun afslutte som dig selv.' using errcode = 'insufficient_privilege';
    end if;
    new.completed_on := private.today_dk();
    new.completed_by := (select auth.uid());
    new.completed_at := now();
    new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
  end if;
  return new;
end;
$$;

create trigger guard_module_completion before insert on public.module_completions
  for each row execute function private.guard_module_completion();

-- Ingen tællinger i et afsluttet modul (heller ikke når admin flytter en tælling).
create function private.block_completed_module_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.module_completions c where c.student_id = new.student_id and c.course_module_id = new.course_module_id)
     or (tg_op = 'UPDATE' and exists (
       select 1 from public.module_completions c where c.student_id = old.student_id and c.course_module_id = old.course_module_id)) then
    raise exception 'Modulet er afsluttet og kan ikke ændres.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger block_completed_module before insert or update on public.module_signoffs
  for each row execute function private.block_completed_module_signoff();

alter table public.module_completions enable row level security;
revoke all on public.module_completions from anon, authenticated;
grant select, insert on public.module_completions to authenticated;   -- ingen update/delete: kan ikke ændres
grant all on public.module_completions to service_role;

create policy "Skolen ser afsluttede moduler, eleven sine egne" on public.module_completions
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Læreren afslutter moduler" on public.module_completions
  for insert to authenticated with check (instructor_id in (select private.my_instructor_ids()));

create trigger write_audit after insert on public.module_completions
  for each row execute function private.write_audit();

revoke all on function private.guard_module_completion(), private.block_completed_module_signoff() from public, anon;
grant execute on function private.guard_module_completion(), private.block_completed_module_signoff() to authenticated, service_role;
