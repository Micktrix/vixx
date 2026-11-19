-- Kontoret er som en lærer (aftalt 19. nov. 2026): kontoret planlægger og har elever, hold, lokaler, køretøjer
-- og beskeder, men ingen godkendelser, løn, ferie-afgørelser, lærere, satser eller ændringslog.
-- Seed: Ole kontor (a100-…02), Anne admin (…01), Lars lærer (a200-…11 / a100-…11) med en afventende
-- registrering i går og egen pris.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- En afventende ferieanmodning fra Lars langt ude i fremtiden.
insert into public.holidays (school_id, instructor_id, from_date, to_date)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 400, current_date + 405);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

-- Kan ikke:
select is((select count(*) from public.registrations), 0::bigint, 'Kontoret ser ingen registreringer');
with u as (update public.registrations set status = 'approved' returning 1)
select is((select count(*) from u), 0::bigint, 'Kontoret kan ikke godkende registreringer');
select is((select count(*) from public.audit_log), 0::bigint, 'Kontoret ser ikke ændringsloggen');
select is((select count(*) from public.instructor_prices), 0::bigint, 'Kontoret ser ikke lærernes egne satser');
with u as (update public.holidays set status = 'approved' where status = 'pending' returning 1)
select is((select count(*) from u), 0::bigint, 'Kontoret kan ikke godkende ferie');
select throws_ok(
  $$insert into public.instructors (school_id, user_id) values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000002')$$,
  '42501', null, 'Kontoret kan ikke oprette lærere');

-- Kan:
select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date + 300, '08:00', 1, 'office')$$,
  'Kontoret kan planlægge lektioner');
select lives_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date + 301, '08:00', 2, 'sick')$$,
  'Kontoret kan registrere fravær');
select ok((select count(*) from public.holidays) > 0, 'Kontoret ser ferie i kalenderen');
select lives_ok(
  $$insert into public.teams (school_id, name) values ('00000000-0000-4000-a000-000000000001', 'Kontorets hold')$$,
  'Kontoret kan oprette hold');
select throws_ok(
  $$insert into public.resources (school_id, kind, name) values ('00000000-0000-4000-a000-000000000001', 'room', 'Lokale 9')$$,
  '42501', null, 'Kontoret kan ikke oprette lokaler (kun admin)');

-- Admin kan godkende.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
with u as (update public.registrations set status = 'approved'
  where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1 returning 1)
select ok((select count(*) from u) > 0, 'Admin kan godkende registreringer');
reset role;

select * from finish();
rollback;
