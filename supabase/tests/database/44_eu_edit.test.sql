-- Trin E9b: admin retter EU-emner og lægger blanket op, kun når forløbet er låst op; et bekræftet emne kan ikke
-- slettes; lærere kan ikke rette; Lastsikring og Multitest er aftaletyper.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create temporary table ids as
select
  (select id from public.courses where kind = 'EU_GODS' and school_id = '00000000-0000-4000-a000-000000000001') as gods,
  (select t.id from public.eu_topics t join public.courses c on c.id = t.course_id
    where c.kind = 'EU_GODS' and c.school_id = '00000000-0000-4000-a000-000000000001' and t.code = '1.1') as g11;
grant select on ids to authenticated;

set local role authenticated;
-- Anne (admin).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok($$update public.eu_topics set hours = 5 where id = (select g11 from ids)$$,
  '23514', null, 'Et låst EU-forløb kan ikke rettes');
update public.courses set locked = false where id = (select gods from ids);
select lives_ok($$update public.eu_topics set hours = 5 where id = (select g11 from ids)$$, 'Låst op: admin retter timerne');
select lives_ok(
  $$insert into public.eu_plan_files (school_id, course_id, file_name, storage_path)
    select '00000000-0000-4000-a000-000000000001', gods, 'EU gods 2027.pdf', 'x/eu/test.pdf' from ids$$,
  'Låst op: admin lægger en ny blanket op');
-- Lars bekræfter emne 1.1 på Emil; derefter kan emnet ikke slettes.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok($$select public.record_eu_scan('00000000-0000-4000-ad00-000000000031', array[g11], null, null, null) from ids$$,
  'Læreren bekræfter emnet');
update public.eu_topics set hours = 9 where id = (select g11 from ids);
reset role;
select is((select hours from public.eu_topics where id = (select g11 from ids)), 5.0::numeric, 'En lærer kan ikke rette EU-emner');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok($$delete from public.eu_topics where id = (select g11 from ids)$$, '23503', null,
  'Et bekræftet emne kan ikke slettes');
select lives_ok(
  $$insert into public.student_appointments (school_id, student_id, kind, on_date, status)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', 'multitest', current_date, 'passed')$$,
  'Multitest kan registreres som bestået');
update public.courses set locked = true where id = (select gods from ids);
select throws_ok($$update public.eu_topics set hours = 6 where id = (select g11 from ids)$$,
  '23514', null, 'Låst igen: kan ikke rettes');

select * from finish();
rollback;
