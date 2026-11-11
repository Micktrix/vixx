-- Lokaler og køretøjer: sletning af ubrugte.
-- Seed: Lokale 1 (a600-…01) er booket i morgen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Kontoret (Ole).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select throws_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000001'$$,
  '23503', 'Lokale 1 har bookinger og kan kun slås fra.', 'Et lokale med bookinger kan ikke slettes');

insert into public.resources (id, school_id, kind, name)
values ('00000000-0000-4000-a600-000000000099', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Ny bil');
select lives_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000099'$$,
  'Et ubrugt køretøj kan slettes');
reset role;

select * from finish();
rollback;
