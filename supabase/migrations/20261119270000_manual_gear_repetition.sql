-- Trin E8, del 5 (19. nov. 2026, aftalt med Michael):
-- 1. Kode 78 (forsøgsordningen med manuelt gear, kun B): kontoret sætter flueben på eleven. Så kan læreren
--    markere "Manuelt gear" ved kørsel i modul 2–5, og Vixx tæller dem pr. modul til modulplanen.
-- 2. Repetitionslektioner efter ikke bestået praktisk prøve: når alle moduler er afsluttet, registrerer læreren
--    dem ved scanning (dato, antal). Underskriften kræves og kopieres som ved afslutning af et modul. Kan ikke
--    ændres eller slettes.
-- 3. Lærerskift: skolens lærere skifter ofte inden for et modul; det dækkes af "Undervisende kørelærere".
--    Siden "Oplysninger ved kørelærerskifte" (og skift af køreskole) udfyldes i hånden ved skift af køreskole.

alter table public.students
  add column manual_gear boolean not null default false;   -- kode 78 (kun B)

alter table public.module_signoffs
  add column manual_gear boolean not null default false,
  add constraint module_signoffs_manual_gear_check check (not manual_gear or kind = 'driving');

create function private.check_manual_gear()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.manual_gear and not exists (
    select 1
    from public.students s
    join public.course_modules m on m.id = new.course_module_id and m.course_id = s.course_id
    join public.courses c on c.id = m.course_id
    where s.id = new.student_id and s.manual_gear and c.category_code = 'B' and m.number between 2 and 5
  ) then
    raise exception 'Manuelt gear kan kun markeres for B-elever i forsøgsordningen (kode 78), modul 2–5.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_manual_gear before insert or update on public.module_signoffs
  for each row execute function private.check_manual_gear();

-- Repetitionslektioner.
create table public.repetition_lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  lesson_date date not null default private.today_dk(),
  lesson_count int not null check (lesson_count between 1 and 12),
  instructor_id uuid not null,
  instructor_name text not null default '',
  strokes text check (strokes ~ '^[ML0-9 .-]+$'),          -- kopi af underskriften (kan ikke læses via API'et)
  signed_by uuid not null default auth.uid() references auth.users (id),
  signed_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create index repetition_lessons_school_idx on public.repetition_lessons (school_id);
create index repetition_lessons_student_idx on public.repetition_lessons (student_id);
create index repetition_lessons_instructor_idx on public.repetition_lessons (instructor_id);

create function private.guard_repetition_lesson()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course uuid;
begin
  select s.course_id into v_course from public.students s
  where s.id = new.student_id and s.school_id = new.school_id and s.active;
  if v_course is null then
    raise exception 'Eleven findes ikke.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.course_modules m where m.course_id = v_course)
     or exists (
       select 1 from public.course_modules m
       where m.course_id = v_course
         and not exists (
           select 1 from public.module_completions c
           where c.student_id = new.student_id and c.course_module_id = m.id and c.annulled_at is null)) then
    raise exception 'Repetitionslektioner registreres, når alle moduler er afsluttet.' using errcode = 'check_violation';
  end if;
  new.strokes := private.instructor_signature(new.instructor_id);
  if current_user = 'authenticated' then
    if new.instructor_id not in (select private.my_instructor_ids()) then
      raise exception 'Du kan kun registrere som dig selv.' using errcode = 'insufficient_privilege';
    end if;
    if new.strokes is null then
      raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du registrerer repetitionslektioner.'
        using errcode = 'check_violation';
    end if;
    new.lesson_date := private.today_dk();
    new.signed_by := (select auth.uid());
    new.signed_at := now();
    new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
  end if;
  return new;
end;
$$;

create trigger guard_repetition_lesson before insert on public.repetition_lessons
  for each row execute function private.guard_repetition_lesson();
-- Læreren kommer også på listen over undervisende kørelærere.
create trigger add_module_plan_teacher after insert on public.repetition_lessons
  for each row execute function private.add_module_plan_teacher();

alter table public.repetition_lessons enable row level security;
revoke all on public.repetition_lessons from anon, authenticated;
grant select (id, school_id, student_id, lesson_date, lesson_count, instructor_id, instructor_name, signed_by, signed_at)
  on public.repetition_lessons to authenticated;
grant insert on public.repetition_lessons to authenticated;   -- ingen update/delete: kan ikke ændres
grant all on public.repetition_lessons to service_role;

create policy "Skolen ser repetitionslektioner, eleven sine egne" on public.repetition_lessons
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Læreren registrerer repetitionslektioner" on public.repetition_lessons
  for insert to authenticated with check (instructor_id in (select private.my_instructor_ids()));

create trigger write_audit after insert on public.repetition_lessons
  for each row execute function private.write_audit();

revoke all on function private.check_manual_gear(), private.guard_repetition_lesson() from public, anon;
grant execute on function private.check_manual_gear(), private.guard_repetition_lesson() to authenticated, service_role;
