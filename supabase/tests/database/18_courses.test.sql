-- Forløb: kun admin retter, alle på skolen ser, andre skoler ser intet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.courses (id, school_id, category_code, name)
values ('00000000-0000-4000-ab00-000000000001', '00000000-0000-4000-a000-000000000001', 'C', 'Test C-forløb');
insert into public.course_lessons (school_id, course_id, number, lesson_count, content)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ab00-000000000001', '4', 2, '7.1 Igangsætning');

set local role authenticated;

-- Kontoret (Ole): ser, men retter ikke.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.course_lessons where course_id = '00000000-0000-4000-ab00-000000000001'), 1::bigint,
  'Kontoret ser forløbets lektioner');
select throws_ok(
  $$insert into public.courses (school_id, category_code, name) values ('00000000-0000-4000-a000-000000000001', 'D', 'Kontorets forløb')$$,
  '42501', null, 'Kontoret kan ikke oprette forløb');
update public.course_lessons set number = '99' where course_id = '00000000-0000-4000-ab00-000000000001';
select is((select number from public.course_lessons where course_id = '00000000-0000-4000-ab00-000000000001'), '4',
  'Kontoret kan ikke rette en lektion');

-- Læreren (Lars): ser forløbet.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select count(*) from public.courses where id = '00000000-0000-4000-ab00-000000000001'), 1::bigint, 'Læreren ser forløbet');

-- Admin (Anne): retter.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.course_lessons set content = '7.1 Igangsætning og standsning v. kantsten' where course_id = '00000000-0000-4000-ab00-000000000001'$$,
  'Admin kan rette en lektion');
select lives_ok(
  $$insert into public.courses (school_id, category_code, name) values ('00000000-0000-4000-a000-000000000001', 'D', 'D-forløb')$$,
  'Admin kan oprette forløb');
reset role;

-- En anden skole ser intet.
insert into auth.users (id, aud, role, phone) values ('00000000-0000-4000-c100-000000000077', 'authenticated', 'authenticated', '4577777777');
insert into public.profiles (id, full_name, phone) values ('00000000-0000-4000-c100-000000000077', 'Anden admin', '+4577777777');
insert into public.schools (id, name) values ('00000000-0000-4000-c000-000000000077', 'Anden skole');
insert into public.school_members (school_id, user_id, role) values ('00000000-0000-4000-c000-000000000077', '00000000-0000-4000-c100-000000000077', 'admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-c100-000000000077", "role": "authenticated"}', true);
select is((select count(*) from public.courses), 0::bigint, 'En anden skole ser ikke forløbene');
reset role;

select * from finish();
rollback;
