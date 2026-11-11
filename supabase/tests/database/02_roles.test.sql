-- Roller og regler: hvad admin, kontor og lærer må på egen skole.
-- Bygger på seed.sql (Testkøreskolen).
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- En person uden medlemskab, som kontoret kan forsøge at tilføje.
insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-4000-a100-000000000099', 'authenticated', 'authenticated', '4520000099');
insert into public.profiles (id, full_name, phone) values
  ('00000000-0000-4000-a100-000000000099', 'Ny Person', '+4520000099');

-- ---------------------------------------------------------------------------
-- Kontor: må planlægge og håndtere lærere, men ikke priser eller kontorroller
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000001', current_date + 60, 99900)$$,
  '42501', null, 'Kontoret kan ikke oprette priser');

update public.service_prices set amount_ore = 1 where service_id = '00000000-0000-4000-a500-000000000001';

select throws_ok(
  $$insert into public.school_members (school_id, user_id, role)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000099', 'admin')$$,
  '42501', null, 'Kontoret kan ikke gøre nogen til admin');

select lives_ok(
  $$insert into public.school_members (school_id, user_id, role)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000099', 'instructor')$$,
  'Kontoret kan tilføje en lærer');

select lives_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000013', current_date + 1000, '08:00', 2, 'other')$$,
  'Kontoret kan registrere fravær');

select throws_ok(
  $$update public.pay_periods set locked = false where locked$$,
  '42501', 'Kun admin kan låse en lønperiode op.', 'Kontoret får besked om, at kun admin kan låse op');
reset role;

select is((select count(*) from public.pay_periods where locked), 1::bigint,
  'Kontoret kan ikke låse en lønperiode op');

select is(
  (select amount_ore from public.service_prices
    where service_id = '00000000-0000-4000-a500-000000000001' order by valid_from limit 1),
  26000, 'Kontorets forsøg på at ændre en pris har ingen effekt');

-- ---------------------------------------------------------------------------
-- Admin: må ændre priser, og ændringen logges med hvem
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000001', current_date + 60, 27500)$$,
  'Admin kan oprette en ny pris');

select is(
  (select actor_id from public.audit_log where table_name = 'service_prices' order by id desc limit 1),
  '00000000-0000-4000-a100-000000000001'::uuid,
  'Prisændringen står i ændringsloggen med admin som ophav');
reset role;

-- ---------------------------------------------------------------------------
-- Lærer Lars: egne registreringer, aldrig godkendelse
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012',
            '00000000-0000-4000-a500-000000000006', current_date, '08:00', 1)$$,
  '42501', null, 'Lærer kan ikke registrere for en anden lærer');

select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date + 1, '08:00', 1)$$,
  '23514', null, 'Lærer kan ikke registrere en lektion i morgen');

insert into public.registrations (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, status, locked_unit_price_ore)
values ('00000000-0000-4000-a700-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
        '00000000-0000-4000-a500-000000000001', current_date, '14:30', 1, 'approved', 100);
select is(
  (select status::text from public.registrations where id = '00000000-0000-4000-a700-000000000001'),
  'pending', 'En lærers nye registrering står altid som afventer');

update public.registrations set status = 'approved', locked_unit_price_ore = 100
  where id = '00000000-0000-4000-a700-000000000001';
select is(
  (select status::text from public.registrations where id = '00000000-0000-4000-a700-000000000001'),
  'pending', 'Lærer kan ikke godkende sin egen registrering');

update public.registrations set note = 'ændret af lærer'
  where instructor_id = '00000000-0000-4000-a200-000000000011' and status = 'approved';

select throws_ok(
  $$update public.instructors set employee_number = '999' where id = '00000000-0000-4000-a200-000000000011'$$,
  '42501', null, 'Lærer kan ikke ændre sit medarbejdernummer');

select lives_ok(
  $$update public.instructors set next_of_kin_name = 'Test Pårørende', next_of_kin_phone = '+4520009999'
    where id = '00000000-0000-4000-a200-000000000011'$$,
  'Lærer kan rette sine pårørendeoplysninger');

update public.scheduled_lessons set note = 'kontorlektion ændret af lærer'
  where instructor_id = '00000000-0000-4000-a200-000000000011' and origin = 'office';

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date + 5, '08:00', 2, 'instructor')$$,
  'Lærer kan planlægge sin egen lektion');

select throws_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date, '08:00', 2, 'sick')$$,
  '42501', null, 'Lærer kan ikke selv oprette fravær');

insert into public.holidays (id, school_id, instructor_id, from_date, to_date, status)
values ('00000000-0000-4000-a800-000000000001', '00000000-0000-4000-a000-000000000001',
        '00000000-0000-4000-a200-000000000011', current_date + 40, current_date + 41, 'approved');
select is(
  (select status::text from public.holidays where id = '00000000-0000-4000-a800-000000000001'),
  'pending', 'Lærerens ferieanmodning står som afventer, også hvis den sendes som godkendt');

select is((select count(*) from public.audit_log), 0::bigint, 'Lærer kan ikke læse ændringsloggen');
reset role;

-- Efterkontrol som databaseejer
select is(
  (select count(*) from public.registrations
    where instructor_id = '00000000-0000-4000-a200-000000000011' and note = 'ændret af lærer'),
  0::bigint, 'Lærer kan ikke rette en godkendt registrering');

select is(
  (select count(*) from public.scheduled_lessons
    where note = 'kontorlektion ændret af lærer'),
  0::bigint, 'Lærer kan ikke ændre en lektion, kontoret har planlagt');

select is(
  (select changes ->> 'next_of_kin_phone' from public.audit_log
    where table_name = 'instructors' order by id desc limit 1),
  '(ændret)', 'Ændringsloggen gemmer ikke pårørendes telefonnummer');

-- ---------------------------------------------------------------------------
-- Lektionslængde: ændring på skolen flytter ikke eksisterende lektioner
-- ---------------------------------------------------------------------------
update public.schools set lesson_minutes = 40 where id = '00000000-0000-4000-a000-000000000001';
select is(
  (select end_time from public.scheduled_lessons
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 2),
  '10:45'::time, 'Eksisterende lektion beholder sin længde, når skolen ændrer lektionslængde');

select * from finish();
rollback;
