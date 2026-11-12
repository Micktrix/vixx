-- Lektioner kobles på en rigtig elev (12. nov. 2026): læreren og kontoret vælger eleven fra en liste, så
-- lektionen kommer i elevens kalender. Eleven skal høre til samme skole. Slettes eleven, står navnet tilbage.

-- Elev-id'er, der ikke (længere) findes, ryddes, før reglen slås til.
update public.scheduled_lessons l set student_id = null
where student_id is not null and not exists (select 1 from public.students s where s.id = l.student_id and s.school_id = l.school_id);
update public.registrations r set student_id = null
where student_id is not null and not exists (select 1 from public.students s where s.id = r.student_id and s.school_id = r.school_id);

alter table public.scheduled_lessons
  add constraint scheduled_lessons_student_fk foreign key (school_id, student_id)
  references public.students (school_id, id) on delete set null (student_id);
alter table public.registrations
  add constraint registrations_student_fk foreign key (school_id, student_id)
  references public.students (school_id, id) on delete set null (student_id);

create index scheduled_lessons_student_idx on public.scheduled_lessons (student_id);
create index registrations_student_idx on public.registrations (student_id);
