-- En booking af bil eller lokale med en underviser gør underviseren optaget.
-- Pia (a200-…14) bruges på en dag uden andet. Lokale 2 (a600-…02), Personbil 1 (a600-…03).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Som kontoret (Ole), så reglerne for appens brugere gælder.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

insert into public.bookings (id, school_id, resource_id, booking_date, start_time, minutes, title, instructor_id)
values ('00000000-0000-4000-a900-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000002',
        current_date + 40, '10:00', 90, 'Møde', '00000000-0000-4000-a200-000000000014');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014',
            '00000000-0000-4000-a500-000000000006', current_date + 40, '10:45', 1, 'office')$$,
  '23P01', 'Læreren har booket Møde kl. 10:00–11:30.', 'En lektion kan ikke ligge oven i underviserens booking');

select throws_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014', current_date + 40, '09:00', 2, 'off')$$,
  '23P01', null, 'Fravær kan ikke ligge oven i underviserens booking');

select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000003',
            current_date + 40, '11:00', 60, 'Kørsel', '00000000-0000-4000-a200-000000000014')$$,
  '23P01', null, 'Underviseren kan ikke have to bookinger samtidig');

select lives_ok(
  $$update public.bookings set minutes = 120 where id = '00000000-0000-4000-a900-000000000001'$$,
  'En booking kan forlænges uden at ramme sig selv');

-- En lektion med bil: lektionens egen booking tæller ikke som en konflikt.
insert into public.scheduled_lessons (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
values ('00000000-0000-4000-a800-000000000041', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014',
        '00000000-0000-4000-a500-000000000006', current_date + 40, '13:45', 2, 'office');
select lives_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, instructor_id, scheduled_lesson_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000003',
            current_date + 40, '13:45', 90, '00000000-0000-4000-a200-000000000014', '00000000-0000-4000-a800-000000000041')$$,
  'En lektion kan få en bil');

select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001',
            current_date + 40, '14:00', 30, 'Møde', '00000000-0000-4000-a200-000000000014')$$,
  '23P01', null, 'En booking kan ikke ligge oven i underviserens lektion');
reset role;

select * from finish();
rollback;
