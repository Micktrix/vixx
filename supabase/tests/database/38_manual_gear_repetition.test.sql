-- Trin E8, del 5: kode 78 (manuelt gear, kun B, modul 2–5, kun elever i forsøgsordningen) og
-- repetitionslektioner (når alle moduler er afsluttet; underskrift kræves og kopieres; kan ikke ændres).
-- Seed: Bent (B, kode 78) har modul 1 afsluttet og 2 kørselslektioner i manuelt gear i modul 2.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 2) as b2;
grant select on ids to authenticated;

select is(
  (select sum(lesson_count)::int from public.module_signoffs where course_module_id = (select b2 from ids) and manual_gear),
  2, 'Seed: Bent har 2 kørselslektioner i manuelt gear i modul 2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, manual_gear, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'theory', 1, true,
           '00000000-0000-4000-a200-000000000011' from ids$$,
  '23514', null, 'Manuelt gear gælder kun kørsel');
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, manual_gear, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'driving', 1, true,
           '00000000-0000-4000-a200-000000000011' from ids$$,
  'Læreren markerer kørsel i manuelt gear for en kode 78-elev');
reset role;
update public.students set manual_gear = false where id = '00000000-0000-4000-ad00-000000000033';
set local role authenticated;
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, manual_gear, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'driving', 1, true,
           '00000000-0000-4000-a200-000000000011' from ids$$,
  '23514', null, 'Manuelt gear kun for elever i forsøgsordningen');

select throws_ok(
  $$insert into public.repetition_lessons (school_id, student_id, lesson_count, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', 2, '00000000-0000-4000-a200-000000000011')$$,
  '23514', null, 'Repetition først, når alle moduler er afsluttet');

-- Modul 2–5 afsluttes (overført) som superbruger.
reset role;
insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, instructor_name, completed_by, declaration, transferred, completed_on)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', m.id, '00000000-0000-4000-a200-000000000011',
       'Lars Jensen', '00000000-0000-4000-a100-000000000011', true, true, current_date - 1
from public.course_modules m join public.courses c on c.id = m.course_id
where c.name = 'B – modulplan' and m.number between 2 and 5 order by m.number;
set local role authenticated;

select lives_ok(
  $$insert into public.repetition_lessons (school_id, student_id, lesson_count, instructor_id, lesson_date)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', 2, '00000000-0000-4000-a200-000000000011', current_date - 50)$$,
  'Læreren registrerer repetitionslektioner');
select results_eq(
  $$select instructor_name, lesson_date, lesson_count from public.repetition_lessons$$,
  $$values ('Lars Jensen', private.today_dk(), 2)$$,
  'Lærerens navn og dagens dato sættes af Vixx');
select throws_ok(
  $$insert into public.repetition_lessons (school_id, student_id, lesson_count, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', 2, '00000000-0000-4000-a200-000000000012')$$,
  '42501', null, 'Læreren kan ikke registrere som en anden lærer');
select throws_ok($$update public.repetition_lessons set lesson_count = 5$$, '42501', null, 'Repetitionslektioner kan ikke rettes');
select throws_ok($$delete from public.repetition_lessons$$, '42501', null, 'Repetitionslektioner kan ikke slettes');
select throws_ok($$select strokes from public.repetition_lessons$$, '42501', null, 'Kopien af underskriften kan ikke læses via appen');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.repetition_lessons), 1::bigint, 'Eleven ser sine repetitionslektioner');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.repetition_lessons), 0::bigint, 'Eleven ser ikke andres repetitionslektioner');
reset role;

select is((select strokes from public.repetition_lessons),
  (select strokes from public.instructor_signatures where user_id = '00000000-0000-4000-a100-000000000011'),
  'Repetitionen får en kopi af lærerens underskrift');

select * from finish();
rollback;
