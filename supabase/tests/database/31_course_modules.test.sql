-- Trin E8, del 1: modulforløb. Kun admin opretter og retter, alle på skolen ser, eleven ser kun sit eget forløb.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Seed: B-forløbet fra modulplanen (version 1.1).
select is(
  (select count(*) from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan'),
  5::bigint, 'B-forløbet har 5 moduler');
select results_eq(
  $$select sum(m.min_theory)::int, sum(m.min_driving)::int, sum(m.min_dark)::int, max(c.min_days), max(c.plan_version)
    from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan'$$,
  $$values (30, 24, 1, 14, '1.1')$$,
  'B: minimum 30 teori + 24 kørsel (1 i mørke), 14 dage, version 1.1');

-- Freja skifter til B-forløbet; Emil bliver på C-forløbet.
update public.students set course_id = (select id from public.courses where name = 'B – modulplan')
where id = '00000000-0000-4000-ad00-000000000032';

-- Regler på data.
select throws_ok(
  $$update public.courses set plan_kind = 'lessons' where name = 'B – modulplan'$$,
  '23514', null, 'Et forløb kan ikke laves om til en lektionsplan');
select throws_ok(
  $$update public.course_modules set min_dark = 7 where number = 4
    and course_id = (select id from public.courses where name = 'B – modulplan')$$,
  '23514', null, 'Kørsel i mørke kan ikke være mere end kørsel i alt');
select throws_ok(
  $$select public.create_module_course('00000000-0000-4000-a000-000000000001', 'X-9', 'Ukendt')$$,
  '22023', null, 'Ukendt modulplan afvises');

set local role authenticated;

-- Kontoret (Ole): ser, men opretter og retter ikke.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 8::bigint, 'Kontoret ser modulerne (B: 5, C: 3)');
select throws_ok(
  $$select public.create_module_course('00000000-0000-4000-a000-000000000001', 'B-1.1', 'Kontorets B')$$,
  '42501', null, 'Kontoret kan ikke oprette et modulforløb');
update public.course_modules set min_theory = 0 where number = 1;
select is((select min_theory from public.course_modules where number = 1 and course_id = (select id from public.courses where name = 'B – modulplan')), 7, 'Kontoret kan ikke rette et modul');

-- Læreren (Lars): ser modulerne.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 8::bigint, 'Læreren ser modulerne (B: 5, C: 3)');

-- Eleverne: Freja ser kun sit B-forløbs moduler, Emil kun C-forløbets.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000032", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 5::bigint, 'Eleven ser modulerne i sit eget forløb');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 3::bigint, 'Eleven ser ikke moduler i andre forløb (Emil: kun C)');

-- Admin (Anne): opretter og retter.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$select public.create_module_course('00000000-0000-4000-a000-000000000001', 'B-1.1', 'B – aftenhold')$$,
  'Admin kan oprette et modulforløb fra skabelonen');
update public.course_modules set topics = topics || E'\nEkstra emne'
where number = 5 and course_id = (select id from public.courses where name = 'B – aftenhold');
select ok((select topics like '%Ekstra emne' from public.course_modules
  where number = 5 and course_id = (select id from public.courses where name = 'B – aftenhold')), 'Admin kan rette et modul');
reset role;

-- En anden skole ser intet.
insert into auth.users (id, aud, role, phone) values ('00000000-0000-4000-c100-000000000077', 'authenticated', 'authenticated', '4577777777');
insert into public.profiles (id, full_name, phone) values ('00000000-0000-4000-c100-000000000077', 'Anden admin', '+4577777777');
insert into public.schools (id, name) values ('00000000-0000-4000-c000-000000000077', 'Anden skole');
insert into public.school_members (school_id, user_id, role) values ('00000000-0000-4000-c000-000000000077', '00000000-0000-4000-c100-000000000077', 'admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-c100-000000000077", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 0::bigint, 'En anden skole ser ikke modulerne');
reset role;

select * from finish();
rollback;
