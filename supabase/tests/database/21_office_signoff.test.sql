-- Admin krydser en lektion af med kommentar (fx gæstelærer); kontoret kan ikke. Afsluttede hold kan ikke
-- få nye elever.
-- Seed: Emil (ad00-…31) og Freja (ad00-…32) på holdet ac00-…01 og C-forløbet. Anne er admin (a100-…01),
-- Ole kontor (a100-…02).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table lesson4 as
select id from public.course_lessons where course_id = '00000000-0000-4000-ab00-000000000011' and number = '4';
grant select on lesson4 to authenticated;

set local role authenticated;

-- Kontoret (Ole) må ikke.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, comment)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, '', 'Gæstelærer' from lesson4$$,
  '42501', null, 'Kontoret kan ikke krydse af');

-- Admin (Anne).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, comment)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, '', ' ' from lesson4$$,
  '23514', 'Skriv en kommentar, fx hvem der kørte lektionen.', 'Kommentar er påkrævet');
select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, comment, lesson_date)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, '', 'Gæstelærer', private.today_dk() + 1 from lesson4$$,
  '23514', 'Datoen kan ikke ligge frem i tiden.', 'Ikke frem i tiden');
select lives_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, comment, lesson_date)
    select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', id, '', 'Kørt af gæstelærer Per', private.today_dk() - 3 from lesson4$$,
  'Admin krydser lektion 4 af');
select is(
  (select (lesson_number, confirmed_at is not null, lesson_date = private.today_dk() - 3)::text
     from public.lesson_signoffs where student_id = '00000000-0000-4000-ad00-000000000031'),
  '(4,t,t)', 'Afkrydsningen er gennemført med det samme og beholder datoen');
select throws_ok(
  $$update public.lesson_signoffs set comment = 'x' where student_id = '00000000-0000-4000-ad00-000000000031'$$,
  '42501', null, 'Afkrydsningen kan ikke ændres');

-- Et afsluttet hold kan ikke få nye elever, men elever på holdet kan stadig rettes.
update public.students set team_id = null where id = '00000000-0000-4000-ad00-000000000032';
update public.teams set active = false where id = '00000000-0000-4000-ac00-000000000001';
select throws_ok(
  $$update public.students set team_id = '00000000-0000-4000-ac00-000000000001' where id = '00000000-0000-4000-ad00-000000000032'$$,
  '23514', 'Holdet er afsluttet og kan ikke få nye elever.', 'Afsluttet hold afviser nye elever');
select lives_ok(
  $$update public.students set service_id = null where id = '00000000-0000-4000-ad00-000000000031'$$,
  'Elever på et afsluttet hold kan stadig rettes');
reset role;

-- Admins demo-elev (Anne selv) kommer aldrig på lønnen.
insert into public.students (school_id, user_id, course_id, is_demo)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000001', '00000000-0000-4000-ab00-000000000011', true);
select throws_ok(
  $$insert into public.lesson_signoffs (school_id, student_id, course_lesson_id, lesson_number, comment, registration_id)
    select s.school_id, s.id, l.id, '4', 'x', (select id from public.registrations limit 1)
    from public.students s, lesson4 l where s.is_demo$$,
  '23514', 'En demo-elev kommer ikke på lønnen.', 'Demo-elevens kvittering kan ikke kobles på en registrering');
select throws_ok(
  $$insert into public.students (school_id, user_id, course_id, is_demo)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000002', '00000000-0000-4000-ab00-000000000011', true)$$,
  '23505', null, 'Højst én demo-elev pr. skole');

select * from finish();
rollback;
