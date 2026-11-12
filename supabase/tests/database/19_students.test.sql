-- Elever og hold: eleven ser kun sig selv, sit hold, sin skole og forløbene – ikke lærere, bookinger eller løn.
-- Seed: Emil (bruger a100-…31) og Freja (…32) er elever på "C-hold uge 48".
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.students), 1::bigint, 'Eleven ser kun sig selv');
select is((select count(*) from public.teams), 1::bigint, 'Eleven ser sit hold');
select is((select count(*) from public.schools), 1::bigint, 'Eleven ser sin skole');
select ok((select count(*) from public.course_lessons) >= 3, 'Eleven ser forløbets lektioner');
select is((select count(*) from public.profiles), 1::bigint, 'Eleven ser kun sin egen profil');
select is((select count(*) from public.instructors), 0::bigint, 'Eleven ser ikke lærerne');
select is((select count(*) from public.scheduled_lessons), 0::bigint, 'Eleven ser ikke kalenderen');
select is((select count(*) from public.registrations), 0::bigint, 'Eleven ser ikke timeregistreringer');
select is((select count(*) from public.bookings), 0::bigint, 'Eleven ser ikke bookinger');
select throws_ok(
  $$insert into public.students (school_id, user_id, course_id) values
    ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000031', '00000000-0000-4000-ab00-000000000011')$$,
  '42501', null, 'Eleven kan ikke oprette elever');

-- Læreren (Lars) ser skolens elever og deres navne (til QR-kvittering).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select count(*) from public.students), 2::bigint, 'Læreren ser skolens elever');
select is((select full_name from public.profiles where id = '00000000-0000-4000-a100-000000000031'), 'Emil Elev',
  'Læreren ser elevens navn');
reset role;

select * from finish();
rollback;
