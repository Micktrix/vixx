-- Faste forløb (ombygning 21. nov. 2026): B, C, C/E, D, EU og Taxa oprettes automatisk. Låst: kun admin kan låse op
-- og rette modulerne. Alle på skolen ser, eleven ser kun sit eget forløb.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Seed: B-forløbet fra modulplanen (version 1.1).
select is(
  (select count(*) from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001'),
  5::bigint, 'B-forløbet har 5 moduler');
select results_eq(
  $$select sum(m.min_theory)::int, sum(m.min_driving)::int, sum(m.min_dark)::int, max(c.min_days), max(c.plan_version)
    from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001'$$,
  $$values (30, 24, 1, 14, '1.1')$$,
  'B: minimum 30 teori + 24 kørsel (1 i mørke), 14 dage, version 1.1');

-- Freja skifter til B-forløbet; Emil bliver på C-forløbet.
update public.students set course_id = (select id from public.courses where name = 'B' and school_id = '00000000-0000-4000-a000-000000000001')
where id = '00000000-0000-4000-ad00-000000000032';

-- Regler på data.
select throws_ok(
  $$update public.courses set plan_kind = 'lessons' where name = 'B' and school_id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'Et forløb kan ikke laves om til en lektionsplan');
select throws_ok(
  $$update public.course_modules set min_dark = 7 where number = 4
    and course_id = (select id from public.courses where name = 'B' and school_id = '00000000-0000-4000-a000-000000000001')$$,
  '23514', null, 'Kørsel i mørke kan ikke være mere end kørsel i alt');
select results_eq(
  $$select string_agg(name || ':' || active::text || ':' || theory_at_scan::text || ':' || locked::text, ' ' order by name)
    from public.courses where school_id = '00000000-0000-4000-a000-000000000001'$$,
  $$values ('B:true:true:true C:true:false:true C/E:true:false:true D:true:false:true EU:false:false:true Taxa:false:false:true')$$,
  'Skolen har de faste forløb; teori scannes på B; alle er låst');

set local role authenticated;

-- Kontoret (Ole): ser, men opretter og retter ikke.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 14::bigint, 'Kontoret ser modulerne (B 5, C 3, C/E 3, D 3)');
select throws_ok(
  $$insert into public.courses (school_id, category_code, name) values ('00000000-0000-4000-a000-000000000001', 'A', 'Eget forløb')$$,
  '42501', null, 'Der kan ikke oprettes forløb (de er faste)');
update public.course_modules set min_theory = 0 where number = 1;
select is((select min_theory from public.course_modules where number = 1 and course_id = (select id from public.courses where name = 'B' and school_id = '00000000-0000-4000-a000-000000000001')), 7, 'Kontoret kan ikke rette et modul');

-- Læreren (Lars): ser modulerne.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 14::bigint, 'Læreren ser modulerne');

-- Eleverne: Freja ser kun sit B-forløbs moduler, Emil kun C-forløbets.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000032", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 5::bigint, 'Eleven ser modulerne i sit eget forløb');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules), 3::bigint, 'Eleven ser ikke moduler i andre forløb (Emil: kun C)');

-- Admin (Anne): opretter og retter.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$update public.course_modules set topics = topics || E'
Ekstra emne'
    where number = 5 and course_id = (select id from public.courses where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001')$$,
  '23514', null, 'Et låst forløb kan ikke rettes');
select throws_ok(
  $$update public.courses set name = 'Bil' where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'Et fast forløb kan ikke omdøbes');
delete from public.courses where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001';
select is((select count(*) from public.courses where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001'), 1::bigint, 'Et fast forløb kan ikke slettes');
update public.courses set locked = false where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001';
update public.course_modules set topics = topics || E'
Ekstra emne'
where number = 5 and course_id = (select id from public.courses where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001');
select ok((select topics like '%Ekstra emne' from public.course_modules
  where number = 5 and course_id = (select id from public.courses where kind = 'B' and school_id = '00000000-0000-4000-a000-000000000001')), 'Admin låser op og retter et modul');
select is((select count(*) from public.audit_log where table_name = 'courses' and changes::text like '%locked%'), 1::bigint, 'Lås op logges');
reset role;

-- En anden skole ser intet.
insert into auth.users (id, aud, role, phone) values ('00000000-0000-4000-c100-000000000077', 'authenticated', 'authenticated', '4577777777');
insert into public.profiles (id, full_name, phone) values ('00000000-0000-4000-c100-000000000077', 'Anden admin', '+4577777777');
insert into public.schools (id, name) values ('00000000-0000-4000-c000-000000000077', 'Anden skole');
insert into public.school_members (school_id, user_id, role) values ('00000000-0000-4000-c000-000000000077', '00000000-0000-4000-c100-000000000077', 'admin');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-c100-000000000077", "role": "authenticated"}', true);
select is((select count(*) from public.course_modules where school_id = '00000000-0000-4000-a000-000000000001'), 0::bigint, 'En anden skole ser ikke modulerne');
select is((select count(*) from public.courses where kind is not null), 6::bigint, 'En ny skole får selv de seks faste forløb');
reset role;

select * from finish();
rollback;
