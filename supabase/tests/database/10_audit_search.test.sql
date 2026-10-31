-- Trin 9: søgning i ændringsloggen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Kontoret (Ole) laver to ændringer, så loggen har noget at søge i.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason, note)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000013', current_date + 3, '08:00', 2, 'off', 'Tandlæge');
update public.instructors set availability = 'on_request' where id = '00000000-0000-4000-a200-000000000014';

select ok(
  exists (select 1 from public.search_audit('00000000-0000-4000-a000-000000000001', 'tandlæge')),
  'Søgning finder tekst i ændringerne (uden hensyn til store/små bogstaver)');
select ok(
  exists (select 1 from public.search_audit('00000000-0000-4000-a000-000000000001', 'Søren') where table_name = 'absences'),
  'Søgning på lærerens navn finder ændringer på lærerens data');
select ok(
  exists (select 1 from public.search_audit('00000000-0000-4000-a000-000000000001', 'Ole Kontor') where table_name = 'instructors'),
  'Søgning på personen, der ændrede');
select is(
  (select actor_name from public.search_audit('00000000-0000-4000-a000-000000000001', 'tandlæge') limit 1),
  'Ole Kontor', 'Navnet på den, der ændrede, følger med');
select is(
  (select count(*) from public.search_audit('00000000-0000-4000-a000-000000000001', '100%')),
  0::bigint, 'Procenttegn i søgningen er bogstaveligt');
reset role;

-- En lærer ser ingenting.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is(
  (select count(*) from public.search_audit('00000000-0000-4000-a000-000000000001')),
  0::bigint, 'En lærer kan ikke se ændringsloggen');
reset role;

select * from finish();
rollback;
