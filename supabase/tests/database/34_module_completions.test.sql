-- Trin E8, del 4: afslut modul. Minimum skal være nået (medmindre "Overført fra lektionsplan"), modulerne
-- afsluttes i rækkefølge, Vixx regner ekstra lektioner ud, og en afslutning kan aldrig ændres eller slettes.
-- Seed: Bent (B) har modul 1 afsluttet; i modul 2 har han 2 af 5 teori og 2 af 3 kørsel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 1) as b1,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 2) as b2,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 3) as b3,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id where c.name = 'B – modulplan' and m.number = 4) as b4;
grant select on ids to authenticated;

select results_eq(
  $$select module_number, extra_theory, extra_driving, instructor_name from public.module_completions
    where student_id = '00000000-0000-4000-ad00-000000000033'$$,
  $$values (1, 0, 0, 'Lars Jensen')$$,
  'Seed: modul 1 er afsluttet af Lars');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, '00000000-0000-4000-a200-000000000011', true from ids$$,
  '23514', null, 'Modulerne afsluttes i rækkefølge');
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true from ids$$,
  '23514', null, 'Modulet kan ikke afsluttes, før minimum er nået');

select lives_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, k, n, '00000000-0000-4000-a200-000000000011'
    from ids, (values ('theory'::public.course_lesson_kind, 3), ('driving', 2)) v (k, n)$$,
  'Lars tæller resten af modul 2 (5 teori, 4 kørsel)');
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', false from ids$$,
  '23514', null, 'Erklæringen skal være sat');
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000012', true from ids$$,
  '42501', null, 'Læreren kan ikke afslutte som en anden lærer');
select lives_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration, self_study, completed_on)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true,
           '1 lektion: afsnit 6.2.3', current_date - 100 from ids$$,
  'Læreren afslutter modul 2, når minimum er nået');
select results_eq(
  $$select extra_theory, extra_driving, instructor_name, completed_on, self_study from public.module_completions where course_module_id = (select b2 from ids)$$,
  $$values (0, 1, 'Lars Jensen', private.today_dk(), '1 lektion: afsnit 6.2.3')$$,
  'Vixx regner ekstra lektioner ud og sætter lærer og dato');
select throws_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, '00000000-0000-4000-a200-000000000011', true from ids$$,
  '23505', null, 'Et modul afsluttes kun én gang');
select throws_ok(
  $$insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, instructor_id)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b2, 'theory', 1, '00000000-0000-4000-a200-000000000011' from ids$$,
  '23514', null, 'Der kan ikke tælles i et afsluttet modul');
select throws_ok(
  $$update public.module_completions set extra_theory = 5 where course_module_id = (select b2 from ids)$$,
  '42501', null, 'En afslutning kan ikke rettes');
select throws_ok(
  $$delete from public.module_completions where course_module_id = (select b2 from ids)$$,
  '42501', null, 'En afslutning kan ikke slettes');
select lives_ok(
  $$insert into public.module_completions (school_id, student_id, course_module_id, instructor_id, declaration, transferred)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', b3, '00000000-0000-4000-a200-000000000011', true, true from ids$$,
  'Overført fra lektionsplan: modulet kan afsluttes uden minimum');

-- Admin kan ikke flytte en tælling ud af et afsluttet modul.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$update public.module_signoffs set course_module_id = (select b4 from ids) where course_module_id = (select b1 from ids)$$,
  '23514', null, 'Admin kan ikke flytte tællinger ud af et afsluttet modul');

-- Hvem ser hvad.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.module_completions), 3::bigint, 'Eleven ser sine afsluttede moduler');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.module_completions), 0::bigint, 'Eleven ser ikke andres afsluttede moduler');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.module_completions), 3::bigint, 'Kontoret ser de afsluttede moduler');
reset role;

select * from finish();
rollback;
