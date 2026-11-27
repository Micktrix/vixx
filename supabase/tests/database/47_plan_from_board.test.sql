-- Trin E11: planlæg fra holdtavlen. En planlagt lektion må være uden ydelse, når den peger på en lektion i
-- lektionsplanen eller en EU-køretime; ellers kræves ydelsen stadig. Overlap tjekkes som altid.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create temporary table ids as
select (select l.id from public.school_lessons l join public.courses c on c.id = l.course_id
  where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and l.kind = 'kta') as kta;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, lesson_date, start_time, lesson_count, origin, school_lesson_id, note, student_ids)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 40, '08:00', 4, 'office', kta, 'KTA',
      array['00000000-0000-4000-ad00-000000000031'::uuid] from ids$$,
  'KTA planlægges uden ydelse');
select is((select span_minutes from public.scheduled_lessons where lesson_date = current_date + 40 and note = 'KTA'), 210,
  'Lektionerne følger skolens lektionsplan (08:00–11:30)');
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 41, '08:00', 1, 'office')$$,
  '23514', null, 'Uden ydelse og uden lektion afvises');
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, lesson_date, start_time, lesson_count, origin, school_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 40, '10:00', 1, 'office', kta from ids$$,
  '23P01', null, 'Overlap tjekkes som altid');

select * from finish();
rollback;
