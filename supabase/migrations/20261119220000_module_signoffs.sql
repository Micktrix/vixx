-- Trin E8, del 3: eleven på modul (19. nov. 2026).
-- Læreren scanner elevens QR-kode, vælger teori eller kørsel (evt. i mørke), antal og modul (Vixx foreslår
-- første modul, hvor minimum ikke er nået). Det tælles i modulet. Lærerens scanning er nok (ingen
-- elevunderskrift i modulplanen), og det går ikke til lønnen (lektioner og timer er adskilt, aftalt 18. nov.).
-- Modulets opstartsdato er datoen for første tælling i modulet.
-- En tælling kan aldrig slettes. Admin kan rette antal, modul og "i mørke", og kan give lektioner uden lærer
-- med en kommentar (fx gæstelærer uden app), som ved teori-tælleren.

create table public.module_signoffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  course_module_id uuid not null references public.course_modules (id),   -- et brugt modul kan ikke slettes
  kind public.course_lesson_kind not null,
  lesson_count int not null check (lesson_count between 1 and 12),
  dark boolean not null default false,
  instructor_id uuid,                                   -- null = givet af admin (med kommentar)
  instructor_name text not null default '',
  signed_by uuid not null default auth.uid() references auth.users (id),
  signed_at timestamptz not null default now(),
  lesson_date date not null default private.today_dk(),
  comment text check (char_length(comment) <= 500),
  check (not dark or kind = 'driving'),
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create index module_signoffs_school_idx on public.module_signoffs (school_id);
create index module_signoffs_student_idx on public.module_signoffs (student_id);
create index module_signoffs_module_idx on public.module_signoffs (course_module_id);
create index module_signoffs_instructor_idx on public.module_signoffs (instructor_id);

create function private.guard_module_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Modulet skal høre til elevens forløb (også når admin flytter tællingen til et andet modul).
  if not exists (
    select 1 from public.students s join public.course_modules m on m.course_id = s.course_id
    where s.id = new.student_id and m.id = new.course_module_id
  ) then
    raise exception 'Modulet hører ikke til elevens forløb.' using errcode = 'check_violation';
  end if;

  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not private.is_admin(old.school_id) then
      raise exception 'Kun admin kan rette en tælling.' using errcode = 'insufficient_privilege';
    end if;
    if (new.school_id, new.student_id, new.kind, new.instructor_id, new.instructor_name, new.signed_by, new.signed_at, new.lesson_date, new.comment)
       is distinct from
       (old.school_id, old.student_id, old.kind, old.instructor_id, old.instructor_name, old.signed_by, old.signed_at, old.lesson_date, old.comment) then
      raise exception 'Kun antal, modul og mørke kan rettes.' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if not exists (select 1 from public.students s where s.id = new.student_id and s.school_id = new.school_id and s.active) then
    raise exception 'Eleven findes ikke.' using errcode = 'check_violation';
  end if;
  if new.instructor_id is null then
    if not private.is_admin(new.school_id) then
      raise exception 'Kun admin kan give lektioner uden lærer.' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(btrim(new.comment), '') = '' then
      raise exception 'Skriv en kommentar, fx hvem der underviste.' using errcode = 'check_violation';
    end if;
    if new.lesson_date is null or new.lesson_date > private.today_dk() then
      raise exception 'Datoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
    end if;
  else
    if new.instructor_id not in (select private.my_instructor_ids()) then
      raise exception 'Du kan kun kvittere som dig selv.' using errcode = 'insufficient_privilege';
    end if;
    new.lesson_date := private.today_dk();
    new.comment := null;
  end if;
  new.signed_by := (select auth.uid());
  new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
  new.signed_at := now();
  return new;
end;
$$;

create trigger guard_module_signoff before insert or update on public.module_signoffs
  for each row execute function private.guard_module_signoff();

alter table public.module_signoffs enable row level security;
revoke all on public.module_signoffs from anon, authenticated;
grant select, insert, update on public.module_signoffs to authenticated;
grant all on public.module_signoffs to service_role;

create policy "Skolen ser modultællinger, eleven sine egne" on public.module_signoffs
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Lærere tæller i moduler, admin giver lektioner" on public.module_signoffs
  for insert to authenticated with check (
    instructor_id in (select private.my_instructor_ids())
    or (instructor_id is null and private.is_admin(school_id))
  );
create policy "Admin retter modultællinger" on public.module_signoffs
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
-- Ingen slette-regel: en tælling kan aldrig slettes.

create trigger write_audit after insert or update on public.module_signoffs
  for each row execute function private.write_audit();

revoke all on function private.guard_module_signoff() from public, anon;
grant execute on function private.guard_module_signoff() to authenticated, service_role;
