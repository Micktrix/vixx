-- Trin E8, del 4b: admin annullerer en afslutning (med begrundelse, kun den seneste) og afslutter moduler
-- for gæstelærere uden app (navn, dato, kommentar, ingen erklæring i Vixx).
-- Seed: Bent (B) har modul 1 afsluttet af Lars; modul 2 er ikke nået.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 1) as b1,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 2) as b2;
grant select on ids to authenticated;

set local role authenticated;

-- Admin: gæstelærer afslutter modul 2 (overført, så minimum ikke kræves).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_name, completed_on, transferred, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'Ib Gæst', current_date - 1, true, false from ids$$,
  '23514', null, 'Gæstelærer: kommentar skal skrives');
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_name, completed_on, transferred, declaration, comment)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'Ib Gæst', current_date + 1, true, false, 'Vikar' from ids$$,
  '23514', null, 'Gæstelærer: datoen kan ikke ligge frem i tiden');
select lives_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_name, completed_on, transferred, declaration, comment)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'Ib Gæst', current_date - 1, true, true, 'Vikar uden Vixx' from ids$$,
  'Admin afslutter modul 2 for en gæstelærer');
select results_eq(
  $$select instructor_name, declaration, completed_on, comment from public.module_completions where course_module_id = (select b2 from ids)$$,
  $$values ('Ib Gæst', false, current_date - 1, 'Vikar uden Vixx')$$,
  'Gæstelærerens navn og dato gemmes; ingen erklæring i Vixx');

-- Annullering.
select throws_ok(
  $$update public.module_completions set annul_reason = 'Fejl' where course_module_id = (select b1 from ids)$$,
  '23514', null, 'Kun det seneste afsluttede modul kan annulleres');
select throws_ok(
  $$update public.module_completions set annul_reason = ' ' where course_module_id = (select b2 from ids)$$,
  '23514', null, 'Annullering kræver en begrundelse');
select throws_ok(
  $$update public.module_completions set annul_reason = 'Fejl', instructor_name = 'Andet navn' where course_module_id = (select b2 from ids)$$,
  '42501', null, 'En afslutning kan ikke rettes, kun annulleres');
select lives_ok(
  $$update public.module_completions set annul_reason = 'Forkert elev' where course_module_id = (select b2 from ids)$$,
  'Admin annullerer det seneste afsluttede modul');
select results_eq(
  $$select annulled_by, annul_reason from public.module_completions where course_module_id = (select b2 from ids)$$,
  $$values ('00000000-0000-4000-a100-000000000001'::uuid, 'Forkert elev')$$,
  'Hvem og hvorfor gemmes ved annullering');
select throws_ok(
  $$update public.module_completions set annul_reason = 'Igen' where course_module_id = (select b2 from ids)$$,
  '23514', null, 'En annulleret afslutning kan ikke annulleres igen');

-- Kontoret og læreren kan ikke annullere eller afslutte for gæstelærere.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
update public.module_completions set annul_reason = 'Kontoret' where course_module_id = (select b1 from ids);
select is((select count(*) from public.module_completions where annulled_at is not null), 1::bigint, 'Kontoret kan ikke annullere');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_name, completed_on, transferred, declaration, comment)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'Ib Gæst', current_date, true, false, 'x' from ids$$,
  '42501', null, 'Læreren kan ikke afslutte for en gæstelærer');

-- Modulet er åbent igen: der kan tælles, og det kan afsluttes på ny.
select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, k, n, '00000000-0000-4000-a200-000000000011'
    from ids, (values ('theory'::public.course_lesson_kind, 3), ('driving', 1)) v (k, n)$$,
  'Efter annullering kan der tælles i modulet igen');
select lives_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true from ids$$,
  'Modulet kan afsluttes på ny');
select is((select count(*) from public.module_completions where course_module_id = (select b2 from ids)), 2::bigint,
  'Den annullerede afslutning bliver liggende');
reset role;

select * from finish();
rollback;
