-- Trin E8, del 6a: underskrifter på modulplanen. Læreren skal have gemt sin underskrift for at afslutte et modul,
-- Vixx gemmer en kopi (som ikke ændres), undervisende kørelærere tilføjes automatisk, stregerne kommer ikke i
-- ændringsloggen, og gemte udgaver skrives kun af serveren.
-- Seed: Lars har en underskrift; Bent (B) har modul 1 afsluttet af Lars; modul 2: 2 af 5 teori, 2 af 3 kørsel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 1) as b1,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 2) as b2,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 3) as b3,
  (select strokes from public.instructor_signatures where user_id = '00000000-0000-4000-a100-000000000011') as lars_old;
grant select on ids to authenticated;

select is((select strokes from public.module_completions where course_module_id = (select b1 from ids)), (select lars_old from ids),
  'Seed: afslutningen af modul 1 har en kopi af Lars'' underskrift');
select is((select strokes from public.module_plan_teachers where instructor_id = '00000000-0000-4000-a200-000000000011'), (select lars_old from ids),
  'Seed: Lars er undervisende kørelærer med sin underskrift');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, k, n, '00000000-0000-4000-a200-000000000011'
    from ids, (values ('theory'::public.course_lesson_kind, 3), ('driving', 1)) v (k, n)$$,
  'Lars tæller resten af modul 2');
delete from public.instructor_signatures where user_id = '00000000-0000-4000-a100-000000000011';
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true from ids$$,
  '23514', null, 'Uden gemt underskrift kan læreren ikke afslutte et modul');
insert into public.instructor_signatures (school_id, user_id, strokes)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000011', 'M 10 10 L 590 190');
select lives_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration, strokes)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true,
           'M 1 1 L 2 2' from ids$$,
  'Med gemt underskrift kan læreren afslutte');
select throws_ok(
  $$select strokes from public.module_completions$$,
  '42501', null, 'Kopien af underskriften kan ikke læses via appen');
select throws_ok(
  $$insert into public.module_plan_teachers (school_id, student_id, instructor_name, first_on)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', 'Falsk lærer', current_date)$$,
  '42501', null, 'Listen over undervisende kørelærere skrives kun af Vixx');
select throws_ok(
  $$insert into public.module_plan_versions (school_id, student_id, template, content_hash, storage_path, created_by)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', 'B-1.1', repeat('a', 64), 'x.pdf',
            '00000000-0000-4000-a100-000000000011')$$,
  '42501', null, 'Gemte udgaver skrives kun af serveren');

-- Mette (ingen underskrift) tæller en lektion: hun kommer på listen uden underskrift.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000012", "role": "authenticated"}', true);
insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'theory', 2, '00000000-0000-4000-a200-000000000012' from ids;

-- Mette gemmer sin underskrift bagefter: den sættes på hendes tomme plads på listen.
insert into public.instructor_signatures (school_id, user_id, strokes)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000012', 'M 5 5 L 300 100');

-- Admin: gæstelærer afslutter modul 3 (overført) og kommer på listen uden underskrift. Kontoret taster adressen.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
insert into public.module_completions (school_id, student_id, course_module_id, instructor_name, completed_on, transferred, declaration, comment)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, 'Ib Gæst', current_date - 1, true, false, 'Vikar' from ids;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
update public.students set address = 'Ny gade 9, 8000 Aarhus C' where id = '00000000-0000-4000-ad00-000000000033';
select is((select address from public.students where id = '00000000-0000-4000-ad00-000000000033'), 'Ny gade 9, 8000 Aarhus C',
  'Kontoret taster elevens adresse');

-- Eleverne: Bent ser sine undervisende kørelærere, Emil ingen.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.module_plan_teachers), 3::bigint, 'Eleven ser sine undervisende kørelærere');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.module_plan_teachers), 0::bigint, 'Eleven ser ikke andres kørelærere');
reset role;

select is((select strokes from public.module_completions where course_module_id = (select b2 from ids)), 'M 10 10 L 590 190',
  'Afslutningen får en kopi af den nye underskrift (ikke en, appen sender med)');
select is((select strokes from public.module_completions where course_module_id = (select b1 from ids)), (select lars_old from ids),
  'En ny underskrift ændrer ikke gamle afslutninger');
select is((select strokes from public.module_plan_teachers where instructor_id = '00000000-0000-4000-a200-000000000011'), (select lars_old from ids),
  'Listen over undervisende kørelærere beholder den første kopi');
select is((select strokes from public.module_plan_teachers where instructor_id = '00000000-0000-4000-a200-000000000012'), 'M 5 5 L 300 100',
  'Gemmer læreren sin underskrift senere, kommer den på listen over undervisende kørelærere');
update public.instructor_signatures set strokes = 'M 9 9 L 99 99' where user_id = '00000000-0000-4000-a100-000000000012';
select is((select strokes from public.module_plan_teachers where instructor_id = '00000000-0000-4000-a200-000000000012'), 'M 5 5 L 300 100',
  'En ny underskrift ændrer ikke en kopi, der allerede er sat');
select results_eq(
  $$select instructor_name, strokes from public.module_plan_teachers where instructor_id is null$$,
  $$values ('Ib Gæst', null::text)$$,
  'Gæstelæreren kommer på listen uden underskrift');
select is(
  (select count(*) from public.audit_log where table_name = 'module_completions' and changes::text like '%590 190%'),
  0::bigint, 'Underskriftens streger kommer ikke i ændringsloggen');

select * from finish();
rollback;
