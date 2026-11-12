-- Elevdelen (12. nov. 2026):
-- 1) Admin kan krydse en lektion af i elevens forløb med en kommentar, fx når en gæstelærer uden adgang
--    til appen har kørt lektionen. Afkrydsningen tæller som gennemført med det samme og går ikke til lønnen.
-- 2) Et afsluttet hold kan ikke få nye elever.
-- 3) Demo-elev til at vise elevens skærm.

alter table public.lesson_signoffs
  alter column instructor_id drop not null,
  add column comment text check (char_length(comment) <= 500);   -- admins begrundelse ved afkrydsning

create or replace function private.guard_lesson_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.instructor_id is null then
      -- Admins afkrydsning: altid med kommentar, ikke frem i tiden og uden registrering til lønnen.
      if not private.is_admin(new.school_id) then
        raise exception 'Kun admin kan krydse en lektion af.' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(btrim(new.comment), '') = '' then
        raise exception 'Skriv en kommentar, fx hvem der kørte lektionen.' using errcode = 'check_violation';
      end if;
      if new.lesson_date is null or new.lesson_date > private.today_dk() then
        raise exception 'Datoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
      end if;
      new.registration_id := null;
      new.confirmed_at := now();
    else
      if new.instructor_id not in (select private.my_instructor_ids()) then
        raise exception 'Du kan kun kvittere som dig selv.' using errcode = 'insufficient_privilege';
      end if;
      new.lesson_date := private.today_dk();
      new.confirmed_at := null;
      new.comment := null;
    end if;
    select l.number into v_number
    from private.student_course_lesson(new.student_id, new.course_lesson_id, new.school_id) l;
    if v_number is null then
      raise exception 'Lektionen hører ikke til elevens forløb.' using errcode = 'check_violation';
    end if;
    new.lesson_number := v_number;
    new.signed_by := (select auth.uid());
    new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
    new.signed_at := now();
    return new;
  end if;

  -- UPDATE: kun bekræftelsen (eleven) eller registreringen (læreren, der kvitterede).
  if (new.school_id, new.student_id, new.course_lesson_id, new.lesson_number, new.instructor_id, new.signed_by,
      new.instructor_name, new.signed_at, new.lesson_date, new.skipped_items, new.comment)
     is distinct from
     (old.school_id, old.student_id, old.course_lesson_id, old.lesson_number, old.instructor_id, old.signed_by,
      old.instructor_name, old.signed_at, old.lesson_date, old.skipped_items, old.comment) then
    raise exception 'En kvittering kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  if new.confirmed_at is distinct from old.confirmed_at then
    if old.confirmed_at is not null or not exists (
      select 1 from public.students s where s.id = new.student_id and s.user_id = (select auth.uid())
    ) then
      raise exception 'Kun eleven kan bekræfte lektionen, og kun én gang.' using errcode = 'insufficient_privilege';
    end if;
    new.confirmed_at := now();
  end if;
  if new.registration_id is distinct from old.registration_id and old.signed_by <> (select auth.uid()) then
    raise exception 'Kun læreren, der kvitterede, kan koble timen på.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop policy "Lærere kvitterer" on public.lesson_signoffs;
create policy "Lærere kvitterer, admin krydser af" on public.lesson_signoffs
  for insert to authenticated with check (
    instructor_id in (select private.my_instructor_ids())
    or (instructor_id is null and private.is_admin(school_id))
  );

-- Et afsluttet hold kan ikke få nye elever. Elever, der allerede er på holdet, bliver der.
create function private.guard_student_team()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.team_id is not null
     and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id)
     and not exists (select 1 from public.teams t where t.id = new.team_id and t.active) then
    raise exception 'Holdet er afsluttet og kan ikke få nye elever.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_student_team before insert or update of team_id on public.students
  for each row execute function private.guard_student_team();

-- Demo-elev: admin kan få sin egen elev på skolen (admin er selv eleven), så hele flowet med QR-kode,
-- kvittering og bekræftelse kan vises med ét login. Højst én pr. skole. En demo-elev kommer aldrig på lønnen.
alter table public.students add column is_demo boolean not null default false;
create unique index students_one_demo_per_school on public.students (school_id) where is_demo;

create function private.guard_demo_registration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.registration_id is not null
     and exists (select 1 from public.students s where s.id = new.student_id and s.is_demo) then
    raise exception 'En demo-elev kommer ikke på lønnen.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_demo_registration before insert or update of registration_id on public.lesson_signoffs
  for each row execute function private.guard_demo_registration();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
