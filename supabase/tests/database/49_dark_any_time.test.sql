-- Mørke uden for lektionsplanens tider (28. nov. 2026): den planlagte mørkelektion og "Til løn" på den må starte på
-- alle kvarterer; alt andet følger stadig skolens starttider.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create temporary table ids as
select (select l.id from public.school_lessons l join public.courses c on c.id = l.course_id
        where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and l.kind = 'dark') as dark,
       (select l.id from public.school_lessons l join public.courses c on c.id = l.course_id
        where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and l.number = 1) as first;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.scheduled_lessons (id, school_id, instructor_id, lesson_date, start_time, lesson_count, origin, school_lesson_id, note)
    select '00000000-0000-4000-a800-0000000000d1', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
           current_date, '19:15', 1, 'office', dark, 'Lektion 6 (mørke)' from ids$$,
  'Mørkelektionen kan planlægges kl. 19:15');
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, lesson_date, start_time, lesson_count, origin, school_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 60, '19:15', 1, 'office', first from ids$$,
  '23514', null, 'En almindelig lektion følger stadig lektionsplanen');
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, lesson_date, start_time, lesson_count, origin, school_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 61, '19:10', 1, 'office', dark from ids$$,
  '23514', null, 'Kun hele kvarterer');
select lives_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, scheduled_lesson_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001',
            current_date, '19:15', 1, '00000000-0000-4000-a800-0000000000d1')$$,
  '"Til løn" på mørkelektionen kl. 19:15');
select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001',
            current_date, '20:15', 1)$$,
  '23514', null, 'En uplanlagt lektion uden for planen afvises stadig');

select * from finish();
rollback;
