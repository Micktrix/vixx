-- Trin E9c (Michael 26. nov. 2026): EU-teori og -køretimer kan krydses af fra lærerens computer (holdets side for
-- flere elever på én gang, elevens side for én elev) uden QR-scanning. Læreren vælger datoen (i dag eller tidligere);
-- lærerens navn og gemte underskrift sættes på som ved scanning. QR-scanningen bliver som før (dagens dato).

-- Datoen må vælges, men ikke ligge frem i tiden.
create or replace function private.guard_eu_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course uuid;
begin
  select s.eu_course_id into v_course from public.students s where s.id = new.student_id and s.school_id = new.school_id and s.active;
  if v_course is null then
    raise exception 'Eleven har intet EU-forløb.' using errcode = 'check_violation';
  end if;
  if new.eu_topic_id is not null and not exists (
    select 1 from public.eu_topics t where t.id = new.eu_topic_id and t.course_id = v_course and t.kind = new.kind
  ) then
    raise exception 'Emnet hører ikke til elevens EU-forløb.' using errcode = 'check_violation';
  end if;
  if new.kind = 'drive' and new.eu_topic_id is not null then
    new.drive_title := null;
  end if;
  new.drive_title := nullif(btrim(new.drive_title), '');
  new.signed_on := coalesce(new.signed_on, private.today_dk());
  if new.signed_on > private.today_dk() then
    raise exception 'Datoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
  end if;
  new.instructor_name := coalesce((select p.full_name from public.instructors i join public.profiles p on p.id = i.user_id
                                   where i.id = new.instructor_id), '');
  new.strokes := private.instructor_signature(new.instructor_id);
  if new.strokes is null and current_user = 'authenticated' then
    raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du bekræfter EU.' using errcode = 'check_violation';
  end if;
  if current_user = 'authenticated' then
    new.signed_by := (select auth.uid());
  end if;
  return new;
end;
$$;

-- Fra computeren: emner for flere elever (hver elev får kun de emner, der findes i elevens EU-forløb, og som eleven
-- ikke allerede har) og evt. én køretime (kun for én elev). Alt eller intet. Læreren er den indloggede.
create function public.record_eu_signoffs(
  p_students uuid[],
  p_topics uuid[],
  p_drive uuid,
  p_drive_title text,
  p_drive_lessons int,
  p_date date
)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_student uuid;
  v_school uuid;
  v_instructor uuid;
  v_count int := 0;
  v_n int;
begin
  if coalesce(cardinality(p_students), 0) = 0 then
    raise exception 'Vælg mindst én elev.' using errcode = 'check_violation';
  end if;
  if coalesce(cardinality(p_topics), 0) = 0 and p_drive is null and nullif(btrim(p_drive_title), '') is null then
    raise exception 'Vælg mindst ét emne eller en køretime.' using errcode = 'check_violation';
  end if;
  if (p_drive is not null or nullif(btrim(p_drive_title), '') is not null) and cardinality(p_students) > 1 then
    raise exception 'En køretime registreres for én elev ad gangen.' using errcode = 'check_violation';
  end if;
  foreach v_student in array p_students loop
    select s.school_id into v_school from public.students s where s.id = v_student;
    select i.id into v_instructor from public.instructors i where i.school_id = v_school and i.user_id = (select auth.uid());
    if v_school is null or v_instructor is null then
      raise exception 'Du har ikke adgang til at bekræfte for denne elev.' using errcode = 'insufficient_privilege';
    end if;
    insert into public.eu_signoffs (school_id, student_id, eu_topic_id, kind, instructor_id, signed_on)
    select v_school, v_student, t.id, 'topic', v_instructor, p_date
    from public.eu_topics t
    join public.students s on s.id = v_student and s.eu_course_id = t.course_id
    where t.id = any (coalesce(p_topics, '{}')) and t.kind = 'topic'
      and not exists (select 1 from public.eu_signoffs x where x.student_id = v_student and x.eu_topic_id = t.id and x.kind = 'topic');
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
    if p_drive is not null or nullif(btrim(p_drive_title), '') is not null then
      insert into public.eu_signoffs (school_id, student_id, eu_topic_id, kind, drive_title, lessons, instructor_id, signed_on)
      values (v_school, v_student, p_drive, 'drive', p_drive_title,
              coalesce(p_drive_lessons, (select t.lessons from public.eu_topics t where t.id = p_drive)), v_instructor, p_date);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.record_eu_signoffs(uuid[], uuid[], uuid, text, int, date) from public, anon;
grant execute on function public.record_eu_signoffs(uuid[], uuid[], uuid, text, int, date) to authenticated, service_role;
