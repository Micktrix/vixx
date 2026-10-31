-- Lokaler/køretøjer med flere kategorier/typer, og sletning af ubrugte.
-- Seed: Personbil 1 (a600-…03) dækker B og BE. Lokale 1 (…01) bruges til Teori og er booket i morgen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select array_agg(category_code order by category_code) from public.resource_categories
   where resource_id = '00000000-0000-4000-a600-000000000003'),
  array['B', 'BE'], 'Et køretøj kan dække flere kategorier');
select ok(
  exists (select 1 from public.resource_lesson_types rt join public.lesson_types t on t.id = rt.lesson_type_id
          where rt.resource_id = '00000000-0000-4000-a600-000000000001' and t.name = 'Teori'),
  'Et lokale kan bruges til teori');

-- Kontoret (Ole).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select throws_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000001'$$,
  '23503', 'Lokale 1 har bookinger og kan kun slås fra.', 'Et lokale med bookinger kan ikke slettes');

insert into public.resources (id, school_id, kind, name)
values ('00000000-0000-4000-a600-000000000099', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Ny bil');
insert into public.resource_categories (school_id, resource_id, category_code)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000099', 'B');
select lives_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000099'$$,
  'Et ubrugt køretøj kan slettes');
select is((select count(*) from public.resource_categories where resource_id = '00000000-0000-4000-a600-000000000099'),
  0::bigint, 'Kategorierne slettes med køretøjet');

select is(
  (select count(*) from public.lesson_types where id = '00000000-0000-4000-a300-000000000004'),
  1::bigint, 'Kontoret ser typerne');
reset role;

-- Admin (Anne): typer.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$delete from public.lesson_types where id = '00000000-0000-4000-a300-000000000001'$$,
  '23503', null, 'En type, der bruges af ydelser, kan ikke slettes');
insert into public.lesson_types (id, school_id, name) values ('00000000-0000-4000-a300-000000000099', '00000000-0000-4000-a000-000000000001', 'Kran');
select lives_ok(
  $$delete from public.lesson_types where id = '00000000-0000-4000-a300-000000000099'$$,
  'En ubrugt type kan slettes');
reset role;

select * from finish();
rollback;
