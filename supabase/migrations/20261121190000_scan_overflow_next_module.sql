-- Scanning (Michael, 21. nov. 2026): afsluttes modulet i samme scanning, og er der valgt flere lektioner, end
-- modulet mangler, tælles resten i det næste modul (fx 4 af 5 kørt + 2 lektioner = 1 i modul 1 og 1 i modul 2).
-- Alt eller intet. Mørke (7.19) i næste modul kan ikke bekræftes her; det gøres ved næste scanning.

drop function public.record_scan(uuid, uuid, public.course_lesson_kind, int, text, boolean, boolean, boolean, int, date, text, boolean);

create function public.record_scan(
  p_student uuid,
  p_module uuid,
  p_kind public.course_lesson_kind,
  p_count int,
  p_skipped text,
  p_dark boolean,
  p_manual_gear boolean,
  p_complete boolean,
  p_theory_lessons int,
  p_started_on date,
  p_self_study text,
  p_transferred boolean,
  p_next_count int default 0,
  p_next_skipped text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_school uuid;
  v_instructor uuid;
  v_next uuid;
begin
  select s.school_id into v_school from public.students s where s.id = p_student;
  select i.id into v_instructor from public.instructors i where i.school_id = v_school and i.user_id = (select auth.uid());
  if v_school is null or v_instructor is null then
    raise exception 'Du har ikke adgang til at kvittere for denne elev.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_next_count, 0) < 0 or coalesce(p_next_count, 0) > 8 then
    raise exception 'Vælg antal lektioner.' using errcode = 'check_violation';
  end if;
  if coalesce(p_next_count, 0) > 0 then
    if not coalesce(p_complete, false) then
      raise exception 'Lektioner tælles kun i næste modul, når modulet afsluttes.' using errcode = 'check_violation';
    end if;
    select n.id into v_next
    from public.course_modules m join public.course_modules n on n.course_id = m.course_id and n.number = m.number + 1
    where m.id = p_module;
    if v_next is null then
      raise exception 'Der er intet næste modul.' using errcode = 'check_violation';
    end if;
  end if;

  if coalesce(p_count, 0) > 0 then
    insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, manual_gear, instructor_id, skipped_items)
    values (v_school, p_student, p_module, p_kind, p_count, p_kind = 'driving' and coalesce(p_dark, false),
            p_kind = 'driving' and coalesce(p_manual_gear, false), v_instructor, case when p_kind = 'driving' then p_skipped end);
  elsif not coalesce(p_complete, false) then
    raise exception 'Vælg antal lektioner.' using errcode = 'check_violation';
  end if;
  if coalesce(p_complete, false) then
    insert into public.module_completions (school_id, student_id, course_module_id, module_number, instructor_id, declaration,
                                           transferred, self_study, theory_lessons, started_on)
    values (v_school, p_student, p_module, 0, v_instructor, true, coalesce(p_transferred, false), p_self_study,
            p_theory_lessons, p_started_on);
  end if;
  if v_next is not null then
    insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, manual_gear, instructor_id, skipped_items)
    values (v_school, p_student, v_next, p_kind, p_next_count, false, p_kind = 'driving' and coalesce(p_manual_gear, false), v_instructor,
            case when p_kind = 'driving' then p_next_skipped end);
  end if;
end;
$$;
revoke all on function public.record_scan(uuid, uuid, public.course_lesson_kind, int, text, boolean, boolean, boolean, int, date, text, boolean, int, text)
  from public, anon;
grant execute on function public.record_scan(uuid, uuid, public.course_lesson_kind, int, text, boolean, boolean, boolean, int, date, text, boolean, int, text)
  to authenticated, service_role;
