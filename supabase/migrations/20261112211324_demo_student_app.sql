-- Demo-eleven får hele elevens app (12. nov. 2026): admin kan se kalenderen, anmode og melde afbud på
-- demo-elevens vegne. Elevens funktioner får et valgfrit p_student, som kun virker for skolens demo-elev og
-- kun for admin. Uden p_student er det som før den indloggede elev.

create function private.acting_student(p_school uuid, p_student uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_student is null then private.my_student(p_school)
    else (select s.id from public.students s
          where s.id = p_student and s.school_id = p_school and s.is_demo and s.active and private.is_admin(p_school))
  end;
$$;

drop function public.student_open_slots(uuid);
drop function public.request_open_slot(uuid, uuid);
drop function public.cancel_lesson_request(uuid, uuid);
drop function public.student_lessons(uuid);
drop function public.student_contacts(uuid);

create function public.student_open_slots(p_school uuid, p_student uuid default null)
returns table (id uuid, slot_date date, start_time time, span_minutes int, lesson_count int, instructor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.slot_date, o.start_time, o.span_minutes, o.lesson_count, p.full_name
  from public.students s
  join public.student_instructors si on si.student_id = s.id
  join public.open_slots o on o.instructor_id = si.instructor_id
  join public.instructors i on i.id = o.instructor_id
  join public.profiles p on p.id = i.user_id
  where s.id = private.acting_student(p_school, p_student) and s.can_request
    and private.dk_moment(o.slot_date, o.start_time) > now()
    and not exists (select 1 from public.lesson_requests r where r.slot_id = o.id and r.status in ('pending', 'approved'))
  order by o.slot_date, o.start_time;
$$;

create function public.request_open_slot(p_school uuid, p_slot uuid, p_student uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.acting_student(p_school, p_student);
  v_id uuid;
begin
  if v_student is null or not exists (select 1 from public.students s where s.id = v_student and s.can_request) then
    raise exception 'Du kan ikke selv anmode om kørelektioner. Kontakt kontoret.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.open_slots o
    join public.student_instructors si on si.instructor_id = o.instructor_id and si.student_id = v_student
    where o.id = p_slot and o.school_id = p_school and private.dk_moment(o.slot_date, o.start_time) > now()
  ) then
    raise exception 'Tiden findes ikke længere.' using errcode = 'check_violation';
  end if;
  insert into public.lesson_requests (school_id, slot_id, student_id) values (p_school, p_slot, v_student) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Tiden er lige blevet taget af en anden elev.' using errcode = 'unique_violation';
end;
$$;

create function public.cancel_lesson_request(p_school uuid, p_request uuid, p_student uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.lesson_requests;
  v_start timestamptz;
  v_hours int;
begin
  select r.* into v_request from public.lesson_requests r
  where r.id = p_request and r.school_id = p_school and r.student_id = private.acting_student(p_school, p_student);
  if v_request.id is null or v_request.status not in ('pending', 'approved') then
    raise exception 'Anmodningen findes ikke.' using errcode = 'check_violation';
  end if;
  if v_request.status = 'approved' then
    select private.dk_moment(o.slot_date, o.start_time), s.cancel_hours into v_start, v_hours
    from public.open_slots o join public.schools s on s.id = o.school_id where o.id = v_request.slot_id;
    if v_start - make_interval(hours => v_hours) < now() then
      raise exception 'Fristen for afbud er overskredet. Kontakt kontoret.' using errcode = 'check_violation';
    end if;
    delete from public.scheduled_lessons where id = v_request.scheduled_lesson_id;
  end if;
  update public.lesson_requests set status = 'cancelled', decided_at = now(), decided_by = (select auth.uid()) where id = p_request;
end;
$$;

create function public.student_lessons(p_school uuid, p_student uuid default null)
returns table (
  kind text, id uuid, lesson_date date, start_time time, span_minutes int, lesson_count int,
  instructor_name text, service_name text, status public.request_status, cancel_before timestamptz, request_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'lesson', l.id, l.lesson_date, l.start_time, l.span_minutes, l.lesson_count, p.full_name, sv.name,
         r.status, case when r.id is not null then private.dk_moment(l.lesson_date, l.start_time) - make_interval(hours => sc.cancel_hours) end,
         r.id
  from public.scheduled_lessons l
  join public.instructors i on i.id = l.instructor_id
  join public.profiles p on p.id = i.user_id
  join public.services sv on sv.id = l.service_id
  join public.schools sc on sc.id = l.school_id
  left join public.lesson_requests r on r.scheduled_lesson_id = l.id and r.status = 'approved'
  where l.student_id = private.acting_student(p_school, p_student) and l.school_id = p_school
  union all
  select 'request', r.id, o.slot_date, o.start_time, o.span_minutes, o.lesson_count, p.full_name, null, r.status, null, r.id
  from public.lesson_requests r
  join public.open_slots o on o.id = r.slot_id
  join public.instructors i on i.id = o.instructor_id
  join public.profiles p on p.id = i.user_id
  where r.student_id = private.acting_student(p_school, p_student) and r.school_id = p_school
    and (r.status = 'pending' or (r.status = 'rejected' and o.slot_date >= private.today_dk() - 7))
  order by 3, 4;
$$;

create function public.student_contacts(p_school uuid, p_student uuid default null)
returns table (name text, phone text, is_school boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.contact_phone, true from public.schools s
  where s.id = p_school and private.acting_student(p_school, p_student) is not null
  union all
  select p.full_name, p.phone, false
  from public.student_instructors si
  join public.instructors i on i.id = si.instructor_id
  join public.profiles p on p.id = i.user_id
  where si.student_id = private.acting_student(p_school, p_student)
  order by 3 desc, 1;
$$;

revoke all on function public.student_open_slots(uuid, uuid), public.request_open_slot(uuid, uuid, uuid),
  public.cancel_lesson_request(uuid, uuid, uuid), public.student_lessons(uuid, uuid), public.student_contacts(uuid, uuid) from public, anon;
grant execute on function public.student_open_slots(uuid, uuid), public.request_open_slot(uuid, uuid, uuid),
  public.cancel_lesson_request(uuid, uuid, uuid), public.student_lessons(uuid, uuid), public.student_contacts(uuid, uuid) to authenticated;

-- En demo-elev må altid anmode (admin vælger demo-elevens faste lærere på demo-siden).
update public.students set can_request = true where is_demo;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
