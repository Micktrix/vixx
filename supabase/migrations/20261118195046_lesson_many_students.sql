-- Flere elever pr. time (18. nov. 2026), fx køreteknisk anlæg (KTA) eller kravlegård. En planlagt lektion og en
-- registrering har nu en liste af elever (student_ids) i stedet for én (student_id). Lønnen er uændret: læreren
-- får timen én gang. Lektionen kommer i hver elevs kalender. student_name er stadig fritekst til elever, der
-- ikke er i Vixx.

alter table public.scheduled_lessons add column student_ids uuid[] not null default '{}';
alter table public.registrations add column student_ids uuid[] not null default '{}';

update public.scheduled_lessons set student_ids = array[student_id] where student_id is not null;
update public.registrations set student_ids = array[student_id] where student_id is not null;

alter table public.scheduled_lessons drop constraint scheduled_lessons_student_fk;
alter table public.registrations drop constraint registrations_student_fk;
drop index public.scheduled_lessons_student_idx;
drop index public.registrations_student_idx;
alter table public.scheduled_lessons drop column student_id;
alter table public.registrations drop column student_id;

create index scheduled_lessons_student_ids_idx on public.scheduled_lessons using gin (student_ids);
create index registrations_student_ids_idx on public.registrations using gin (student_ids);

-- Eleverne skal høre til lektionens skole. Dubletter fjernes, og der er højst 30 elever på en time.
create function private.check_lesson_students()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.student_ids is not distinct from old.student_ids then
    return new;
  end if;
  new.student_ids := coalesce((select array_agg(distinct x) from unnest(new.student_ids) x where x is not null), '{}');
  if cardinality(new.student_ids) > 30 then
    raise exception 'Højst 30 elever på en lektion.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(new.student_ids) x
    where not exists (select 1 from public.students s where s.id = x and s.school_id = new.school_id)
  ) then
    raise exception 'Eleven findes ikke på skolen.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger check_lesson_students before insert or update of student_ids on public.scheduled_lessons
  for each row execute function private.check_lesson_students();
create trigger check_lesson_students before insert or update of student_ids on public.registrations
  for each row execute function private.check_lesson_students();

-- Godkendt anmodning: den planlagte lektion skal have eleven med.
create or replace function private.guard_lesson_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_instructor uuid;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.school_id, new.slot_id, new.student_id, new.created_at) is distinct from (old.school_id, old.slot_id, old.student_id, old.created_at) then
    raise exception 'En anmodning kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  select o.instructor_id into v_instructor from public.open_slots o where o.id = old.slot_id;
  if v_instructor is null or v_instructor not in (select private.my_instructor_ids()) then
    raise exception 'Kun læreren kan svare på anmodningen.' using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Anmodningen er allerede besvaret.' using errcode = 'check_violation';
  end if;
  if new.status = 'approved' and not exists (
    select 1 from public.scheduled_lessons l
    where l.id = new.scheduled_lesson_id and l.instructor_id = v_instructor and old.student_id = any (l.student_ids)
  ) then
    raise exception 'Den godkendte anmodning skal have en planlagt lektion med eleven.' using errcode = 'check_violation';
  end if;
  if new.status = 'rejected' then
    new.scheduled_lesson_id := null;
  end if;
  new.decided_by := (select auth.uid());
  new.decided_at := now();
  return new;
end;
$$;

-- Elevens lektioner: alle planlagte lektioner, hvor eleven er med, og elevens anmodninger.
create or replace function public.student_lessons(p_school uuid, p_student uuid default null)
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
  left join public.lesson_requests r
    on r.scheduled_lesson_id = l.id and r.status = 'approved' and r.student_id = private.acting_student(p_school, p_student)
  where private.acting_student(p_school, p_student) = any (l.student_ids) and l.school_id = p_school
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

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
