-- Trin E5: læreren åbner tider, eleven anmoder hos sine faste lærere, læreren godkender, og eleven kan melde
-- afbud inden fristen. Seed: Emil (elev ad00-…31, bruger a100-…31) har Lars (a200-…11, bruger a100-…11) som
-- fast lærer og må anmode. Freja (ad00-…32, bruger a100-…32) har ingen faste lærere.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table ids (slot uuid, request uuid, lesson uuid);
insert into ids values (null, null, null);
grant select, update on ids to authenticated;

set local role authenticated;

-- Lars åbner tider.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.open_slots (school_id, instructor_id, slot_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 5, '10:00', 2)$$,
  'Læreren åbner en tid');
update ids set slot = (select id from public.open_slots limit 1);
select throws_ok(
  $$insert into public.open_slots (school_id, instructor_id, slot_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 5, '10:45', 1)$$,
  '23P01', 'Du har allerede en åben tid i det tidsrum.', 'To åbne tider kan ikke overlappe');
select throws_ok(
  $$insert into public.open_slots (school_id, instructor_id, slot_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date - 1, '10:00', 1)$$,
  '23514', 'En åben tid skal ligge frem i tiden.', 'Ikke i fortiden');
select throws_ok(
  $$insert into public.open_slots (school_id, instructor_id, slot_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012', current_date + 5, '12:00', 1)$$,
  '42501', null, 'Kun for sig selv');

-- Freja har ingen faste lærere og må ikke anmode.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000032", "role": "authenticated"}', true);
select is((select count(*) from public.student_open_slots('00000000-0000-4000-a000-000000000001')), 0::bigint, 'Freja ser ingen åbne tider');
select throws_ok(
  $$select public.request_open_slot('00000000-0000-4000-a000-000000000001', (select slot from ids))$$,
  '42501', null, 'Freja kan ikke anmode');
select is((select count(*) from public.open_slots), 0::bigint, 'Eleven kan ikke læse åbne tider direkte');

-- Emil ser Lars' tid og anmoder.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select instructor_name from public.student_open_slots('00000000-0000-4000-a000-000000000001')), 'Lars Jensen', 'Emil ser Lars'' åbne tid');
update ids set request = public.request_open_slot('00000000-0000-4000-a000-000000000001', (select slot from ids));
select is((select count(*) from public.student_open_slots('00000000-0000-4000-a000-000000000001')), 0::bigint, 'En anmodet tid er ikke længere åben');

-- Lars kan ikke fjerne tiden, men godkender: planlagt lektion med Emil.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok($$delete from public.open_slots$$, '23514', 'Tiden er anmodet eller booket af en elev og kan ikke fjernes.', 'Anmodet tid kan ikke fjernes');
insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, lesson_minutes, student_id, student_name, origin)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001',
        current_date + 5, '10:00', 2, 45, '00000000-0000-4000-ad00-000000000031', 'Emil Elev', 'instructor');
update ids set lesson = (select id from public.scheduled_lessons where student_id = '00000000-0000-4000-ad00-000000000031');
select lives_ok(
  $$update public.lesson_requests set status = 'approved', scheduled_lesson_id = (select lesson from ids)$$,
  'Læreren godkender');

-- Emil ser lektionen og melder afbud (5 dage før, inden for fristen på 24 timer).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is(
  (select kind || ' ' || instructor_name || ' ' || status from public.student_lessons('00000000-0000-4000-a000-000000000001') where lesson_date = current_date + 5),
  'lesson Lars Jensen approved', 'Emil ser den bookede lektion');
select public.cancel_lesson_request('00000000-0000-4000-a000-000000000001', (select request from ids));
select is((select count(*) from public.student_open_slots('00000000-0000-4000-a000-000000000001')), 1::bigint, 'Efter afbud er tiden åben igen');
reset role;

select * from finish();
rollback;
