-- Den gamle lektionsplan fjernes (20. nov. 2026, aftalt med Michael; der er ingen rigtige data i drift).
-- Alle forløb er nu modulplaner (Færdselsstyrelsens eller skolens egne). Væk er:
--   - lektionerne i forløbet (`course_lessons`) og lektionsplanens skabeloner
--   - QR-kvittering pr. lektion med elevens bekræftelse (`lesson_signoffs`) og admins afkrydsning/flytning
--   - den gamle teoritæller (`theory_signoffs`, `courses.theory_lessons`)
-- Elevens underskrift i appen bygges igen senere sammen med taxa og EU, hvor planen kræver den.
-- Et forløb, der var en lektionsplan, bliver et tomt modulforløb, som admin kan bygge (eller slå fra).

drop table public.lesson_signoffs cascade;
drop table public.theory_signoffs cascade;
drop table public.course_lessons cascade;

drop function private.guard_lesson_signoff();
drop function private.guard_demo_registration();
drop function private.guard_theory_signoff();
drop function private.student_course_lesson(uuid, uuid, uuid);
drop function private.check_course_plan_kind() cascade;   -- også triggeren på course_modules

-- Forløbets type: kun modulplaner.
drop trigger keep_plan_kind on public.courses;
drop function private.keep_course_plan_kind();
update public.courses set plan_kind = 'modules' where plan_kind <> 'modules';
alter table public.courses
  alter column plan_kind set default 'modules',
  drop constraint courses_plan_kind_check,
  add constraint courses_plan_kind_check check (plan_kind = 'modules'),
  drop column theory_lessons;
