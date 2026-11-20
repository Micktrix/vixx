-- Nye C- og D-forløb får kørelektionerne automatisk (20. nov. 2026, aftalt med Michael): Vixx kopierer dem fra
-- skolens eget nyeste forløb i samme kategori (med skolens rettelser). Findes der ikke et, bruges lektionsskemaet
-- C + D som udgangspunkt (`add_lesson_schedule`). Lektionerne lægges i modulet med samme nummer.
-- Kører som den, der kalder (RLS): kun admin, og kun inden for egen skole.
create function public.copy_module_lessons(p_from_course uuid, p_to_course uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.module_lessons (school_id, course_module_id, sort_order, number, lesson_count, dark, location, content, notes, control_topic, active)
  select t.school_id, t.id, l.sort_order, l.number, l.lesson_count, l.dark, l.location, l.content, l.notes, l.control_topic, l.active
  from public.module_lessons l
  join public.course_modules f on f.id = l.course_module_id and f.course_id = p_from_course
  join public.course_modules t on t.course_id = p_to_course and t.number = f.number and t.school_id = f.school_id
  where l.active;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.copy_module_lessons(uuid, uuid) from public, anon;
grant execute on function public.copy_module_lessons(uuid, uuid) to authenticated, service_role;
