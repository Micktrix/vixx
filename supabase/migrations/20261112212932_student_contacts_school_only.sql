-- Eleven må ikke se kørelærernes private telefonnumre (12. nov. 2026). Kontakt er skolens nummer; de faste
-- lærere vises kun med navn.
create or replace function public.student_contacts(p_school uuid, p_student uuid default null)
returns table (name text, phone text, is_school boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.contact_phone, true from public.schools s
  where s.id = p_school and private.acting_student(p_school, p_student) is not null
  union all
  select p.full_name, null::text, false
  from public.student_instructors si
  join public.instructors i on i.id = si.instructor_id
  join public.profiles p on p.id = i.user_id
  where si.student_id = private.acting_student(p_school, p_student)
  order by 3 desc, 1;
$$;
