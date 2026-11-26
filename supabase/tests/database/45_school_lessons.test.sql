-- Trin E10: lektionsplanen ved scanning. Lektion 1–3 afslutter modul 1 (lektion 3 tæller også 1 i modul 2), mørke og
-- KTA skal bekræftes, en lektion kan kun registreres én gang, og modul 2 kan afsluttes uden mørke (flyttet til modul 3).
-- Seed: Emil (C-hold); Lars har gemt underskrift.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temporary table l as
select l.number, l.id from public.school_lessons l join public.courses c on c.id = l.course_id
where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001';
grant select on l to authenticated;

select is((select count(*) from l), 10::bigint, 'C har 10 lektioner (1–9 og KTA)');
select is((select min_dark from public.course_modules m join public.courses c on c.id = m.course_id
  where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 3), 1, 'Mørke er flyttet til modul 3');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number in (1, 2) order by number), null, false, false, '{}', '{}')$$,
  'Lektion 1 og 2 registreres');
select throws_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number = 1), null, false, false, '{}', '{}')$$,
  '23505', null, 'En lektion kan kun registreres én gang');
select lives_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number = 3), '7.9 Overhaling', false, false, '{1}', '{8}')$$,
  'Lektion 3 registreres og afslutter modul 1');
reset role;
select is((select sum(s.lesson_count)::int from public.module_signoffs s join public.course_modules m on m.id = s.course_module_id
  where s.student_id = '00000000-0000-4000-ad00-000000000031' and m.number = 1), 5, 'Modul 1 har 5 lektioner');
select is((select sum(s.lesson_count)::int from public.module_signoffs s join public.course_modules m on m.id = s.course_module_id
  where s.student_id = '00000000-0000-4000-ad00-000000000031' and m.number = 2), 1, 'Lektion 3 tæller 1 i modul 2');
select is((select instructor_name from public.module_completions where student_id = '00000000-0000-4000-ad00-000000000031'),
  'Lars Jensen', 'Den der kørte lektion 3, afsluttede modul 1');
select is((select skipped from public.lesson_signoffs ls join l on l.id = ls.school_lesson_id where l.number = 3 and ls.student_id = '00000000-0000-4000-ad00-000000000031'),
  '7.9 Overhaling', 'Ikke gennemførte punkter gemmes på lektionen');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number = 6), null, false, false, '{}', '{}')$$,
  '23514', 'Bekræft, at der er kørt i mørke.', 'Mørkelektionen skal bekræftes');
select lives_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number in (4, 5) order by number), null, false, false, '{2}', '{7}')$$,
  'Lektion 4 og 5 afslutter modul 2 uden mørke');
select throws_ok(
  $$select public.record_lesson_scan('00000000-0000-4000-ad00-000000000031', array(select id from l where number = 10), null, false, false, '{}', '{}')$$,
  '23514', 'Bekræft, at eleven har kørt på køreteknisk anlæg.', 'KTA skal bekræftes');

select * from finish();
rollback;
