-- Teori som tæller (12. nov. 2026). Hvert forløb har et antal teorilektioner (fx B: 28). Læreren scanner
-- elevens QR-kode, vælger "Teori" og antal lektioner; det tæller op. Lærerens scanning er nok (eleven skal
-- ikke bekræfte), og teori går ikke til lønnen. En teori-kvittering kan aldrig slettes; admin kan rette
-- antallet. Admin kan også give teori med en kommentar (fx gæstelærer uden app).

alter table public.courses
  add column theory_lessons int not null default 0 check (theory_lessons between 0 and 200);

create table public.theory_signoffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  instructor_id uuid,                                   -- null = givet af admin (med kommentar)
  instructor_name text not null default '',
  signed_by uuid not null default auth.uid() references auth.users (id),
  signed_at timestamptz not null default now(),
  lesson_date date not null default private.today_dk(),
  lesson_count int not null check (lesson_count between 1 and 12),
  comment text check (char_length(comment) <= 500),
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create index theory_signoffs_school_idx on public.theory_signoffs (school_id);
create index theory_signoffs_student_idx on public.theory_signoffs (student_id);
create index theory_signoffs_instructor_idx on public.theory_signoffs (instructor_id);

create function private.guard_theory_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if not private.is_admin(old.school_id) then
      raise exception 'Kun admin kan rette antallet.' using errcode = 'insufficient_privilege';
    end if;
    if (new.school_id, new.student_id, new.instructor_id, new.instructor_name, new.signed_by, new.signed_at, new.lesson_date, new.comment)
       is distinct from
       (old.school_id, old.student_id, old.instructor_id, old.instructor_name, old.signed_by, old.signed_at, old.lesson_date, old.comment) then
      raise exception 'Kun antallet kan rettes.' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if not exists (select 1 from public.students s where s.id = new.student_id and s.school_id = new.school_id and s.active) then
    raise exception 'Eleven findes ikke.' using errcode = 'check_violation';
  end if;
  if new.instructor_id is null then
    if not private.is_admin(new.school_id) then
      raise exception 'Kun admin kan give teori uden lærer.' using errcode = 'insufficient_privilege';
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

create trigger guard_theory_signoff before insert or update on public.theory_signoffs
  for each row execute function private.guard_theory_signoff();

alter table public.theory_signoffs enable row level security;
revoke all on public.theory_signoffs from anon, authenticated;
grant select, insert, update on public.theory_signoffs to authenticated;
grant all on public.theory_signoffs to service_role;

create policy "Skolen ser teori, eleven sin egen" on public.theory_signoffs
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Lærere kvitterer for teori, admin giver teori" on public.theory_signoffs
  for insert to authenticated with check (
    instructor_id in (select private.my_instructor_ids())
    or (instructor_id is null and private.is_admin(school_id))
  );
create policy "Admin retter antal teorilektioner" on public.theory_signoffs
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
-- Ingen slette-regel: en teori-kvittering kan aldrig slettes.

create trigger write_audit after insert or update on public.theory_signoffs
  for each row execute function private.write_audit();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
