-- Lokaler og køretøjer: kun admin opretter, retter og sletter (19. nov. 2026); sletning af ubrugte.
-- Seed: Lokale 1 (a600-…01) er booket i morgen. Anne admin (a100-…01), Ole kontor (a100-…02).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

set local role authenticated;

-- Kontoret (Ole) ser ressourcerne, men kan ikke oprette, rette eller slette dem.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select ok((select count(*) from public.resources) > 0, 'Kontoret ser lokaler og køretøjer');
select throws_ok(
  $$insert into public.resources (school_id, kind, name) values ('00000000-0000-4000-a000-000000000001', 'room', 'Kontorets lokale')$$,
  '42501', null, 'Kontoret kan ikke oprette lokaler');
with u as (update public.resources set name = 'Omdøbt' returning 1)
select is((select count(*) from u), 0::bigint, 'Kontoret kan ikke rette lokaler og køretøjer');

-- Admin (Anne).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000001'$$,
  '23503', 'Lokale 1 har bookinger og kan kun slås fra.', 'Et lokale med bookinger kan ikke slettes');

select lives_ok(
  $$insert into public.resources (id, school_id, kind, name)
    values ('00000000-0000-4000-a600-000000000099', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Ny bil')$$,
  'Admin kan oprette et køretøj');
select lives_ok(
  $$delete from public.resources where id = '00000000-0000-4000-a600-000000000099'$$,
  'Et ubrugt køretøj kan slettes');
reset role;

select * from finish();
rollback;
