-- Afkrydsning af modulets egne punkter (20. nov. 2026, aftalt med Michael): ved kørsel krydser læreren de punkter
-- af, der IKKE blev kørt, også når modulet ikke har skolens kørelektioner. Så bruges modulets punkter (afsnittene
-- fra modulplanen). Punkterne, der ikke blev kørt, gemmes på tællingen (`skipped_items`) med eller uden lektion.

create or replace function private.apply_module_lesson()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lesson public.module_lessons;
begin
  new.skipped_items := nullif(btrim(new.skipped_items), '');
  if new.module_lesson_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.module_lesson_id is distinct from old.module_lesson_id then
    raise exception 'En gennemført lektion kan ikke flyttes til en anden lektion.' using errcode = 'check_violation';
  end if;
  select * into v_lesson from public.module_lessons where id = new.module_lesson_id;
  if v_lesson.id is null or (tg_op = 'INSERT' and not v_lesson.active) then
    raise exception 'Lektionen findes ikke.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.course_module_id := v_lesson.course_module_id;
    new.kind := 'driving';
    new.lesson_count := v_lesson.lesson_count;
    new.dark := v_lesson.dark;
  end if;
  return new;
end;
$$;
