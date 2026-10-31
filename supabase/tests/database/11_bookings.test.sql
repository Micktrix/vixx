-- Trin 11: booking af lokaler og køretøjer.
-- Seed: Lokale 1 (a600-…01), Lokale 2 (…02), Personbil 1 (…03). Lars (a200-…11) har en egen lektion
-- i morgen kl. 10:15 (2 × 45 min). Lokale 1 er booket i morgen 17:00–20:00.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Kontoret (Ole).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001', current_date + 1, '10:00', 120, 'Møde')$$,
  'Kontoret kan booke et lokale');
select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001', current_date + 1, '11:00', 30, 'Andet')$$,
  '23P01', 'Lokale 1 er optaget kl. 10:00–12:00.', 'Et lokale kan ikke dobbeltbookes');
select lives_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001', current_date + 1, '12:00', 30, 'Lige efter')$$,
  'En booking lige efter er tilladt');

-- Køretøj på Lars' lektion i morgen, og en anden booking af bilen senere.
insert into public.bookings (id, school_id, resource_id, booking_date, start_time, minutes, instructor_id, scheduled_lesson_id)
select '00000000-0000-4000-a900-000000000001', l.school_id, '00000000-0000-4000-a600-000000000003', l.lesson_date, l.start_time,
       l.lesson_count * l.lesson_minutes, l.instructor_id, l.id
from public.scheduled_lessons l
where l.instructor_id = '00000000-0000-4000-a200-000000000011' and l.lesson_date = current_date + 1;
insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000003', current_date + 1, '15:00', 60, 'Service');
reset role;

-- Lars (lærer).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000002', current_date + 1, '08:00', 60, 'Forberedelse',
            '00000000-0000-4000-a200-000000000011')$$,
  'Læreren kan booke et ledigt lokale til sig selv');
select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000002', current_date + 1, '13:00', 60,
            '00000000-0000-4000-a200-000000000012')$$,
  '42501', 'Du kan kun booke til dig selv.', 'Læreren kan ikke booke til en anden');
select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000002', current_date - 1, '13:00', 60,
            '00000000-0000-4000-a200-000000000011')$$,
  '23514', null, 'Læreren kan ikke booke bagud');

-- Lektionen flyttes: bilen følger med.
update public.scheduled_lessons set start_time = '12:00'
where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date + 1;
select is(
  (select start_time from public.bookings where id = '00000000-0000-4000-a900-000000000001'),
  '12:00'::time, 'Bilen følger lektionen, når den flyttes');

-- Flyttes lektionen ind over bilens anden booking, afvises flytningen.
select throws_ok(
  $$update public.scheduled_lessons set start_time = '14:30'
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date + 1$$,
  '23P01', 'Personbil 1 er optaget kl. 15:00–16:00.', 'En lektion kan ikke flyttes, hvis bilen er optaget');

select throws_ok(
  $$delete from public.bookings where id = '00000000-0000-4000-a900-000000000001'$$,
  '42501', null, 'Læreren kan ikke fjerne bilen fra en lektion');
select throws_ok(
  $$update public.bookings set title = 'Min' where id = '00000000-0000-4000-a900-000000000001'$$,
  '42501', null, 'Læreren kan ikke rette en lektions booking');

-- Slettes lektionen, forsvinder bookingen.
select lives_ok(
  $$delete from public.scheduled_lessons
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date + 1$$,
  'Læreren kan slette sin egen lektion med bil');
reset role;

select is((select count(*) from public.bookings where id = '00000000-0000-4000-a900-000000000001'), 0::bigint,
  'Lektionens booking slettes med lektionen');

-- En anden skole får adgang nægtet, uden at få at vide om lokalet er optaget.
insert into auth.users (id, aud, role, phone) values ('00000000-0000-4000-d100-000000000002', 'authenticated', 'authenticated', '4550000002');
insert into public.profiles (id, full_name, phone) values ('00000000-0000-4000-d100-000000000002', 'Kontor D', '+4550000002');
insert into public.schools (id, name) values ('00000000-0000-4000-d000-000000000001', 'Fjerde Køreskole');
insert into public.school_members (school_id, user_id, role) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-d100-000000000002', 'office');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-d100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001', current_date + 1, '10:00', 30)$$,
  '42501', null, 'En anden skole kan ikke booke og ser ikke, om lokalet er optaget');
reset role;

select * from finish();
rollback;
