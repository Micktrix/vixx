-- Aftaler på eleven (21. nov. 2026): lærere og kontor opretter og ser; eleven ser kun sine egne; en anden skole
-- ser intet. Udfaldet (bestået / ikke bestået) kan ikke ændres, og kun bookede aftaler kan slettes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role authenticated;
-- Lars (lærer) booker en teoriprøve til Emil.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.student_appointments (id, school_id, student_id, kind, on_date, at_time, address)
    values ('00000000-0000-4000-ae00-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031',
            'theory_test', current_date - 1, '12:00', '  Prøvecentret, Aarhus  ')$$,
  'Læreren booker en teoriprøve på eleven');
select is((select address from public.student_appointments where id = '00000000-0000-4000-ae00-000000000001'), 'Prøvecentret, Aarhus',
  'Adressen gemmes uden mellemrum omkring');
select throws_ok(
  $$insert into public.student_appointments (school_id, student_id, kind, on_date, status)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', 'kta', current_date + 3, 'passed')$$,
  '23514', null, 'En aftale frem i tiden kan ikke være gennemført');
select lives_ok(
  $$update public.student_appointments set status = 'failed' where id = '00000000-0000-4000-ae00-000000000001'$$,
  'Læreren markerer prøven ikke bestået');
select throws_ok(
  $$update public.student_appointments set status = 'passed' where id = '00000000-0000-4000-ae00-000000000001'$$,
  '23514', 'Udfaldet er gemt og kan ikke ændres. Opret en ny aftale.', 'Udfaldet kan ikke ændres bagefter');
delete from public.student_appointments where id = '00000000-0000-4000-ae00-000000000001';
select is((select count(*) from public.student_appointments where id = '00000000-0000-4000-ae00-000000000001'), 1::bigint,
  'Ikke bestået er historik og kan ikke slettes');

-- Kontoret booker en ny prøve og kan slette den igen (tastet forkert).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.student_appointments (id, school_id, student_id, kind, on_date)
    values ('00000000-0000-4000-ae00-000000000002', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031',
            'theory_test', current_date + 10)$$,
  'Kontoret booker en ny prøve');
delete from public.student_appointments where id = '00000000-0000-4000-ae00-000000000002';
select is((select count(*) from public.student_appointments where id = '00000000-0000-4000-ae00-000000000002'), 0::bigint,
  'En booket aftale kan slettes');

-- Emil (eleven) ser sin aftale, men kan ikke oprette.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.student_appointments), 1::bigint, 'Eleven ser sine egne aftaler');
select throws_ok(
  $$insert into public.student_appointments (school_id, student_id, kind, on_date)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', 'driving_test', current_date + 5)$$,
  '42501', null, 'Eleven kan ikke selv oprette aftaler');

-- Bent (anden elev) og en anden skole ser intet.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.student_appointments), 0::bigint, 'En anden elev ser ikke aftalen');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-b100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.student_appointments), 0::bigint, 'En anden skole ser ikke aftalen');

select * from finish();
rollback;
