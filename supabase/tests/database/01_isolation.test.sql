-- Adskillelse: skoler kan ikke se hinanden, lærere ser kun egne data, anonyme ser intet.
-- Bygger på seed.sql (Testkøreskolen) og opretter en ekstra skole B i transaktionen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ---------------------------------------------------------------------------
-- Opsætning: skole B med én kontorbruger og én lærer
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-4000-b100-000000000002', 'authenticated', 'authenticated', '4530000002'),
  ('00000000-0000-4000-b100-000000000011', 'authenticated', 'authenticated', '4530000011');
insert into public.profiles (id, full_name, phone) values
  ('00000000-0000-4000-b100-000000000002', 'Kontor B', '+4530000002'),
  ('00000000-0000-4000-b100-000000000011', 'Lærer B', '+4530000011');
insert into public.schools (id, name) values ('00000000-0000-4000-b000-000000000001', 'Anden Køreskole');
insert into public.school_members (school_id, user_id, role) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b100-000000000002', 'office'),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b100-000000000011', 'instructor');
insert into public.instructors (id, school_id, user_id) values
  ('00000000-0000-4000-b200-000000000011', '00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b100-000000000011');
insert into public.services (id, school_id, name) values
  ('00000000-0000-4000-b500-000000000001', '00000000-0000-4000-b000-000000000001', 'B privat');
insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-b200-000000000011',
   '00000000-0000-4000-b500-000000000001', current_date, '08:00', 2);

-- ---------------------------------------------------------------------------
-- Anonym (ikke logget ind)
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select * from public.instructors', '42501', null, 'Anonym kan ikke læse lærere');
select throws_ok('select * from public.schools', '42501', null, 'Anonym kan ikke læse skoler');
reset role;

-- ---------------------------------------------------------------------------
-- Lærer Lars (skole A)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select is((select count(*) from public.instructors), 1::bigint, 'Lærer ser kun sig selv blandt lærerne');
select is((select count(*) from public.registrations where instructor_id <> '00000000-0000-4000-a200-000000000011'), 0::bigint,
  'Lærer ser ingen andres registreringer');
select ok((select count(*) from public.registrations) >= 2, 'Lærer ser sine egne registreringer');
select is((select count(*) from public.scheduled_lessons where instructor_id <> '00000000-0000-4000-a200-000000000011'), 0::bigint,
  'Lærer ser ingen andres planlagte lektioner');
select is((select count(*) from public.instructor_prices), 1::bigint, 'Lærer ser kun sin egen pris');
select is((select count(*) from public.services where school_id = '00000000-0000-4000-b000-000000000001'), 0::bigint,
  'Lærer ser ikke en anden skoles ydelser');
select ok((select count(*) from public.services) >= 11, 'Lærer ser egen skoles ydelser');
select is((select count(*) from public.profiles p where not exists (select 1 from public.students s where s.user_id = p.id)), 1::bigint,
  'Lærer ser kun sin egen profil blandt de ansatte (og skolens elever, til QR-kvittering)');
reset role;

-- ---------------------------------------------------------------------------
-- Kontor (skole A)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select ok((select count(*) from public.instructors) >= 9, 'Kontoret ser alle skolens lærere');
select is((select count(*) from public.registrations where school_id = '00000000-0000-4000-b000-000000000001'), 0::bigint,
  'Kontoret ser ikke en anden skoles registreringer');
select is((select count(*) from public.schools), 1::bigint, 'Kontoret ser kun sin egen skole');
select is((select count(*) from public.profiles where id = '00000000-0000-4000-b100-000000000011'), 0::bigint,
  'Kontoret ser ikke profiler fra en anden skole');
reset role;

-- ---------------------------------------------------------------------------
-- Kontor (skole B)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-b100-000000000002", "role": "authenticated"}', true);

select is((select count(*) from public.registrations), 1::bigint, 'Skole B ser kun sin egen registrering');
select is((select count(*) from public.instructors), 1::bigint, 'Skole B ser kun sin egen lærer');
select is((select count(*) from public.audit_log where school_id = '00000000-0000-4000-a000-000000000001'), 0::bigint,
  'Skole B ser ikke skole A''s ændringslog');
reset role;

select * from finish();
rollback;
