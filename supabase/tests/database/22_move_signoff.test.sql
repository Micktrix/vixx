-- Admin flytter en kvittering til den rigtige lektion; lærer og kontor kan ikke.
-- Seed: Emil (ad00-…31) på C-forløbet med lektion 1, 2 og 4. Lars er lærer (a100-…11, a200-…11),
-- Ole kontor (a100-…02), Anne admin (a100-…01).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create temporary table lessons as
select id, number from public.course_lessons where course_id = '00000000-0000-4000-ab00-000000000011';
grant select on lessons to authenticated;

set local role authenticated;

-- Lars kvitterer for lektion 2, men det var lektion 4.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, instructor_id)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, '', '00000000-0000-4000-a200-000000000011'
from lessons where number = '2';

select throws_ok(
  $$update public.lesson_signoffs set course_lesson_id = (select id from lessons where number = '4')$$,
  '42501', null, 'Læreren kan ikke flytte kvitteringen');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
update public.lesson_signoffs set course_lesson_id = (select id from lessons where number = '4');
select is((select lesson_number from public.lesson_signoffs), '2', 'Kontoret kan ikke flytte kvitteringen');

-- Admin (Anne) flytter den.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.lesson_signoffs set course_lesson_id = (select id from lessons where number = '4')$$,
  'Admin flytter kvitteringen til lektion 4');
select is((select lesson_number from public.lesson_signoffs), '4', 'Lektionens nummer følger med');
select throws_ok(
  $$update public.lesson_signoffs set course_lesson_id = gen_random_uuid()$$,
  '23514', 'Lektionen hører ikke til elevens forløb.', 'Kun lektioner i elevens forløb');
select throws_ok(
  $$update public.lesson_signoffs set skipped_items = 'x'$$,
  '42501', 'En kvittering kan ikke ændres.', 'Admin kan ikke ændre andet end lektionen');
reset role;

select * from finish();
rollback;
