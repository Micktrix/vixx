-- Skolens kørelektioner under modulerne: lektionen sætter modul, kørsel, antal og mørke på tællingen, punkter
-- der ikke blev kørt gemmes, en lektion gennemføres én gang pr. elev, og kun admin bygger lektionerne.
-- Seed: "C – modulplan" har lektionsskemaet C + D (9 lektioner); Emil er C-elev, Bent er B-elev.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table ids as
select
  (select id from public.courses where name = 'C – modulplan') as c,
  (select l.id from public.module_lessons l join public.course_modules m on m.id = l.course_module_id
     join public.courses c on c.id = m.course_id where c.name = 'C – modulplan' and l.number = '2') as l2,
  (select l.id from public.module_lessons l join public.course_modules m on m.id = l.course_module_id
     join public.courses c on c.id = m.course_id where c.name = 'C – modulplan' and l.number = '12') as l12,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'C – modulplan' and m.number = 1) as m1;
grant select on ids to authenticated;

select is((select count(*) from public.module_lessons l join public.course_modules m on m.id = l.course_module_id where m.course_id = (select c from ids)),
  9::bigint, 'Seed: C-forløbet har skolens 9 kørelektioner');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id, module_lesson_id, skipped_items)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', m1, 'theory', 5,
           '00000000-0000-4000-a200-000000000011', l2, '2.5 Baglæns kørsel med målbremsning' from ids$$,
  'Læreren gennemfører lektion 2 og krydser et punkt af som ikke kørt');
select results_eq(
  $$select course_module_id, kind::text, lesson_count, skipped_items from public.module_signoffs where module_lesson_id = (select l2 from ids)$$,
  $$select m1, 'driving', 2, '2.5 Baglæns kørsel med målbremsning' from ids$$,
  'Lektionen sætter modul, kørsel og antal (2 × 45 min.)');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id, module_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', m1, 'driving', 2, '00000000-0000-4000-a200-000000000011', l2 from ids$$,
  '23505', null, 'En lektion gennemføres kun én gang pr. elev');
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id, module_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', m1, 'driving', 1, '00000000-0000-4000-a200-000000000011', l12 from ids$$,
  'Læreren gennemfører lektion 12 (mørke)');
select results_eq(
  $$select dark, (select number from public.course_modules where id = course_module_id) from public.module_signoffs where module_lesson_id = (select l12 from ids)$$,
  $$values (true, 2)$$,
  'Lektion 12 tæller som kørsel i mørke i modul 2');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id, module_lesson_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', m1, 'driving', 2, '00000000-0000-4000-a200-000000000011', l2 from ids$$,
  '23514', null, 'En lektion fra et andet forløb kan ikke bruges');
-- Kørsel uden lektion: modulets punkter, der ikke blev kørt, gemmes også.
insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id, skipped_items)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', m1, 'driving', 1,
       '00000000-0000-4000-a200-000000000011', ' 7.5 Vending og baglænskørsel ' from ids;
select is((select skipped_items from public.module_signoffs where module_lesson_id is null and student_id = '00000000-0000-4000-ad00-000000000031'),
  '7.5 Vending og baglænskørsel', 'Punkter, der ikke blev kørt, gemmes også uden lektion');
select throws_ok(
  $$insert into public.module_lessons (school_id, course_module_id, number) select '00000000-0000-4000-a000-000000000001', m1, '99' from ids$$,
  '42501', null, 'Læreren kan ikke oprette lektioner');

-- Kontoret kan ikke bruge skabelonen.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$select public.add_lesson_schedule((select c from ids), 'CD-skema')$$,
  '42501', null, 'Kontoret kan ikke indsætte lektionsskemaet');

-- Admin.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select is(
  (select public.add_lesson_schedule(public.create_module_course('00000000-0000-4000-a000-000000000001', 'D-1.1', 'D – test'), 'CD-skema')),
  9, 'Admin indsætter lektionsskemaet på et D-forløb');
update public.module_lessons set content = 'Rettet af skolen' where number = '2' and course_module_id = (select m1 from ids);
select is(
  (select public.copy_module_lessons((select c from ids), public.create_module_course('00000000-0000-4000-a000-000000000001', 'C-1.1', 'C – aften'))),
  9, 'Lektionerne kopieres fra skolens eget forløb til et nyt C-forløb');
select is(
  (select l.content from public.module_lessons l join public.course_modules m on m.id = l.course_module_id
     join public.courses c on c.id = m.course_id where c.name = 'C – aften' and l.number = '2'),
  'Rettet af skolen', 'Skolens rettelser kommer med i kopien');
select throws_ok(
  $$delete from public.module_lessons where id = (select l2 from ids)$$,
  '23503', null, 'En gennemført lektion kan ikke slettes (kun slås fra)');
update public.module_lessons set active = false where number = '4' and course_module_id = (select m1 from ids);

-- Eleverne ser kun lektionerne i deres eget forløb.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.module_lessons), 9::bigint, 'Eleven ser lektionerne i sit forløb');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.module_lessons), 0::bigint, 'Eleven ser ikke lektioner i andre forløb');
reset role;

select * from finish();
rollback;
