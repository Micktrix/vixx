-- QR-kvittering: læreren kvitterer som sig selv for en lektion i elevens forløb; kun eleven bekræfter;
-- en kvittering kan hverken ændres eller slettes.
-- Seed: Emil (elev ad00-…31, bruger a100-…31) på C-forløbet (ab00-…11). Lars er lærer (a200-…11, bruger a100-…11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table lesson2 as
select id from public.course_lessons where course_id = '00000000-0000-4000-ab00-000000000011' and number = '2';
grant select on lesson2 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, 'x', '00000000-0000-4000-a200-000000000012' from lesson2$$,
  '42501', null, 'Læreren kan ikke kvittere som en anden lærer');

select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', gen_random_uuid(), 'x', '00000000-0000-4000-a200-000000000011')$$,
  '23514', 'Lektionen hører ikke til elevens forløb.', 'Kun lektioner i elevens forløb');

select lives_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, instructor_id, skipped_items)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, 'snyd', '00000000-0000-4000-a200-000000000011', '2.2 Lastbilens spejle' from lesson2$$,
  'Læreren kvitterer for lektion 2');
select is((select lesson_number from public.lesson_signoffs where student_id = '00000000-0000-4000-ad00-000000000031'), '2',
  'Lektionens nummer gemmes fra forløbet, ikke fra klienten');

select throws_ok(
  $$update public.lesson_signoffs set confirmed_at = now() where student_id = '00000000-0000-4000-ad00-000000000031'$$,
  '42501', null, 'Læreren kan ikke bekræfte for eleven');
select throws_ok(
  $$update public.lesson_signoffs set skipped_items = null where student_id = '00000000-0000-4000-ad00-000000000031'$$,
  '42501', 'En kvittering kan ikke ændres.', 'Kvitteringen kan ikke ændres bagefter');

-- Eleven (Emil) bekræfter.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.lesson_signoffs), 1::bigint, 'Eleven ser sin kvittering');
select lives_ok(
  $$update public.lesson_signoffs set confirmed_at = now() where student_id = '00000000-0000-4000-ad00-000000000031'$$,
  'Eleven bekræfter lektionen');
select is((select count(*) from public.lesson_signoffs where confirmed_at is not null), 1::bigint, 'Bekræftelsen er gemt');

-- Kontoret (Ole) kan ikke slette en kvittering.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok($$delete from public.lesson_signoffs$$, '42501', null, 'En kvittering kan ikke slettes');
reset role;

select * from finish();
rollback;
