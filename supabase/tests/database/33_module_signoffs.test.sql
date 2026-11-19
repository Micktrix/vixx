-- Trin E8, del 3: tælling i moduler. Læreren tæller (som sig selv), eleven ser kun sine egne,
-- en tælling kan ikke slettes, kun admin retter, og modulet skal høre til elevens forløb.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 3) as b3,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 4) as b4;
grant select on ids to authenticated;

-- Et modul fra et andet forløb (C/E) må ikke bruges til Bent.
select public.create_module_course('00000000-0000-4000-a000-000000000001', 'CE-1.1', 'Test C/E');

set local role authenticated;

-- Lars (lærer) tæller 2 kørselslektioner i mørke i modul 4.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, instructor_id, lesson_date)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b4, 'driving', 2, true,
           '00000000-0000-4000-a200-000000000011', current_date - 30 from ids$$,
  'Læreren tæller kørsel i mørke i et modul');
select results_eq(
  $$select instructor_name, lesson_date from public.module_signoffs where course_module_id = (select b4 from ids)$$,
  $$values ('Lars Jensen', private.today_dk())$$,
  'Lærerens navn og dagens dato sættes af Vixx');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'theory', 2,
           '00000000-0000-4000-a200-000000000012' from ids$$,
  '42501', null, 'Læreren kan ikke tælle som en anden lærer');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', m.id, 'theory', 2,
           '00000000-0000-4000-a200-000000000011'
    from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'Test C/E' and m.number = 1$$,
  '23514', null, 'Modulet skal høre til elevens forløb');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'theory', 2, true,
           '00000000-0000-4000-a200-000000000011' from ids$$,
  '23514', null, 'Teori kan ikke være i mørke');
update public.module_signoffs set lesson_count = 9 where course_module_id = (select b4 from ids);
select is((select lesson_count from public.module_signoffs where course_module_id = (select b4 from ids)), 2, 'Læreren kan ikke rette en tælling');
select throws_ok(
  $$delete from public.module_signoffs where course_module_id = (select b4 from ids)$$,
  '42501', null, 'En tælling kan ikke slettes');

-- Kontoret ser tællingerne.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.module_signoffs), 5::bigint, 'Kontoret ser tællingerne');

-- Eleverne: Bent ser sine egne, Emil ingen.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.module_signoffs), 5::bigint, 'Eleven ser sine egne tællinger');
select is((select count(*) from public.course_modules), 5::bigint, 'Eleven ser modulerne i sit forløb');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.module_signoffs), 0::bigint, 'Eleven ser ikke andres tællinger');

-- Admin flytter tællingen til modul 3 og retter antallet; admin kan give lektioner uden lærer med kommentar.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.module_signoffs set course_module_id = (select b3 from ids), lesson_count = 3, dark = false
    where course_module_id = (select b4 from ids)$$,
  'Admin retter modul, antal og mørke');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'theory', 2 from ids$$,
  '23514', null, 'Admin skal skrive en kommentar uden lærer');
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, comment, lesson_date)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'theory', 2,
           'Gæstelærer Ib', current_date - 2 from ids$$,
  'Admin giver lektioner med kommentar');
reset role;

select * from finish();
rollback;
