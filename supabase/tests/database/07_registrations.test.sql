-- Trin 6: registreringer fra lærer-appen.
-- Seed: Lars (a200-…11) har en planlagt lektion i dag kl. 08:00 (3 × Amu CE). Mette (…12) har en afvist
-- registrering i går kl. 08:00. Den forrige lønperiode er låst.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Uafhængig af manuelle afprøvninger: kun seedens lektion kl. 08:00 for Lars i dag.
delete from public.scheduled_lessons
where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date and start_time <> '08:00';

-- Uafhængig af tidligere klik i appen: dagens planlagte lektion er ikke registreret.
delete from public.registrations
where scheduled_lesson_id in (select id from public.scheduled_lessons
  where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date)
   or (instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date);

-- En registrering i den låste periode (lagt ind som betroet seed, før låsen gælder appens brugere).
insert into public.registrations (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
select '00000000-0000-4000-a700-000000000077', '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', p.starts_on, '08:00', 1
from public.pay_periods p where p.locked order by p.starts_on desc limit 1;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

-- "Udført" på dagens planlagte lektion.
select lives_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, scheduled_lesson_id, lesson_date, start_time, lesson_count)
    select school_id, instructor_id, service_id, id, lesson_date, start_time, lesson_count
    from public.scheduled_lessons
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date$$,
  'Læreren kan registrere en planlagt lektion som udført');

select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, scheduled_lesson_id, lesson_date, start_time, lesson_count)
    select school_id, instructor_id, service_id, id, lesson_date, start_time, lesson_count
    from public.scheduled_lessons
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date$$,
  '23505', 'Lektionen er allerede registreret.', 'En planlagt lektion kan kun registreres én gang');

select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000006', current_date, '09:00', 1)$$,
  '23P01', 'Du har allerede registreret en lektion kl. 08:00–10:15.', 'Registreringer kan ikke overlappe');

select lives_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, note)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000006', current_date, '10:15', 1, 'Uplanlagt')$$,
  'En uplanlagt registrering lige efter er tilladt');

select is(
  (select status::text from public.registrations where note = 'Uplanlagt' and instructor_id = '00000000-0000-4000-a200-000000000011'),
  'pending', 'Lærerens registrering afventer godkendelse');

select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000006', current_date + 1, '08:00', 1)$$,
  '23514', null, 'Der kan ikke registreres frem i tiden');

-- Låst lønperiode.
select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
           '00000000-0000-4000-a500-000000000006', p.starts_on, '12:00', 1
    from public.pay_periods p where p.locked order by p.starts_on desc limit 1$$,
  '23514', 'Lønperioden er låst. Kontakt kontoret, hvis noget skal rettes.', 'Der kan ikke registreres i en låst periode');
select throws_ok(
  $$delete from public.registrations where id = '00000000-0000-4000-a700-000000000077'$$,
  '23514', null, 'En registrering i en låst periode kan ikke slettes');
reset role;

-- Afviste registreringer blokerer ikke: Mette kan registrere samme tid igen.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000012", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012',
            '00000000-0000-4000-a500-000000000008', current_date - 1, '08:00', 2)$$,
  'En afvist registrering blokerer ikke tiden');
reset role;

-- Kontoret godkender: statusskift kører ikke overlap-tjekket.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select lives_ok(
  $$update public.registrations set status = 'approved', locked_unit_price_ore = 1, decided_at = now()
    where note = 'Uplanlagt' and instructor_id = '00000000-0000-4000-a200-000000000011'$$,
  'Kontoret kan godkende');
reset role;

select * from finish();
rollback;
