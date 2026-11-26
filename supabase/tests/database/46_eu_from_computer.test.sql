-- Trin E9c: EU krydses af fra computeren med valgt dato (ikke frem i tiden); emner, eleven allerede har, springes over.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create temporary table ids as
select
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_GODS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.code = '1.1') as g11,
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_GODS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.code = '1.2') as g12;
grant select on ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select public.record_eu_signoffs(array['00000000-0000-4000-ad00-000000000031'::uuid], array[g11], null, null, null, current_date - 3) from ids),
  1, 'Læreren krydser et emne af med en tidligere dato');
select is((select signed_on from public.eu_signoffs where student_id = '00000000-0000-4000-ad00-000000000031' and eu_topic_id = (select g11 from ids)),
  current_date - 3, 'Den valgte dato gemmes');
select is((select public.record_eu_signoffs(array['00000000-0000-4000-ad00-000000000031'::uuid], array[g11, g12], null, null, null, current_date) from ids),
  1, 'Et emne, eleven allerede har, springes over');
select throws_ok(
  $$select public.record_eu_signoffs(array['00000000-0000-4000-ad00-000000000031'::uuid], '{}', null, 'Bykørsel', 2, current_date + 1)$$,
  '23514', 'Datoen kan ikke ligge frem i tiden.', 'Datoen kan ikke ligge frem i tiden');
select throws_ok(
  $$select public.record_eu_signoffs(array['00000000-0000-4000-ad00-000000000031'::uuid, '00000000-0000-4000-ad00-000000000033'::uuid], '{}', null, 'Bykørsel', 2, current_date)$$,
  '23514', 'En køretime registreres for én elev ad gangen.', 'En køretime er for én elev');

select * from finish();
rollback;
