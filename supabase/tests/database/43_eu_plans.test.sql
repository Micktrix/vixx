-- Trin E9a: fire EU-forløb pr. skole med emner fra blanketterne; EU-forløbet vælges på eleven (aldrig som
-- kørekortforløb); læreren bekræfter emner og køretimer ved scanning med sin gemte underskrift.
-- Seed: Emil har EU Gods; Bent har intet EU; Lars har gemt underskrift, Mette har ikke.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table ids as
select
  (select id from public.courses where kind = 'EU_GODS' and school_id = '00000000-0000-4000-a000-000000000001') as gods,
  (select id from public.courses where kind = 'EU_BUS' and school_id = '00000000-0000-4000-a000-000000000001') as bus,
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_GODS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.code = '1.1') as g11,
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_GODS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.kind = 'drive' and t.sort = 1) as gdrive,
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_BUS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.code = '1.5') as b15;
grant select on ids to authenticated;

select is((select count(*) from public.courses where kind like 'EU%' and school_id = '00000000-0000-4000-a000-000000000001'),
  4::bigint, 'Skolen har fire EU-forløb');
select is((select sum(hours) from public.eu_topics t join ids on t.course_id = ids.gods), 138.0::numeric,
  'EU Gods har blankettens timer (138 t)');
select throws_ok(
  $$update public.students set course_id = (select gods from ids) where id = '00000000-0000-4000-ad00-000000000033'$$,
  '23514', null, 'Et EU-forløb kan ikke være elevens kørekortforløb');
select throws_ok(
  $$update public.students set eu_course_id = (select course_id from public.students where id = '00000000-0000-4000-ad00-000000000031')
    where id = '00000000-0000-4000-ad00-000000000033'$$,
  '23514', 'Vælg et EU-forløb.', 'EU-forløbet skal være et EU-forløb');

set local role authenticated;
-- Lars (lærer, har underskrift).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$select public.record_eu_scan('00000000-0000-4000-ad00-000000000031', array[g11], gdrive, null, null) from ids$$,
  'Læreren bekræfter et emne og en køretime');
select is((select count(*) from public.eu_signoffs where student_id = '00000000-0000-4000-ad00-000000000031'), 2::bigint,
  'Emne og køretime er gemt');
select is((select instructor_name from public.eu_signoffs where student_id = '00000000-0000-4000-ad00-000000000031' and kind = 'topic'),
  'Lars Jensen', 'Lærerens navn sættes på');
select throws_ok(
  $$select public.record_eu_scan('00000000-0000-4000-ad00-000000000031', array[g11], null, null, null) from ids$$,
  '23505', null, 'Et emne kan kun bekræftes én gang');
select throws_ok(
  $$select public.record_eu_scan('00000000-0000-4000-ad00-000000000031', array[b15], null, null, null) from ids$$,
  '23514', 'Emnet hører ikke til elevens EU-forløb.', 'Kun emner fra elevens eget EU-forløb');
select throws_ok(
  $$select public.record_eu_scan('00000000-0000-4000-ad00-000000000033', array[g11], null, null, null) from ids$$,
  '23514', 'Eleven har intet EU-forløb.', 'En elev uden EU kan ikke få EU-emner');

-- Mette har ingen gemt underskrift.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000012", "role": "authenticated"}', true);
select throws_ok(
  $$select public.record_eu_scan('00000000-0000-4000-ad00-000000000031', '{}', null, 'Bykørsel', 2) from ids$$,
  '23514', null, 'Uden gemt underskrift kan læreren ikke bekræfte');

-- Emil (eleven) og en anden skole ser ingen bekræftelser.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.eu_signoffs), 2::bigint, 'Eleven ser sine egne EU-bekræftelser (trin E9b)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-b100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.eu_signoffs), 0::bigint, 'En anden skole ser intet');

select * from finish();
rollback;
