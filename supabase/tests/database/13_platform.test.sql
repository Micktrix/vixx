-- Platform-ejeren (Anne i seed) opretter skoler og tilknytter admin. Andre kan ikke.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.schools (id, name) values ('00000000-0000-4000-e000-000000000001', 'Anden Skole');

-- Kontoret (Ole) ser kun sin egen skole og kan ikke oprette skoler.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.schools where id = '00000000-0000-4000-e000-000000000001'), 0::bigint,
  'Kontoret ser ikke andre skoler');
select throws_ok(
  $$insert into public.schools (name) values ('Ulovlig skole')$$,
  '42501', null, 'Kontoret kan ikke oprette skoler');
reset role;

-- Platform-ejeren (Anne).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select ok((select count(*) from public.schools) >= 2, 'Platform-ejeren ser alle skoler');
select lives_ok(
  $$insert into public.schools (id, name) values ('00000000-0000-4000-e000-000000000002', 'Ny Køreskole')$$,
  'Platform-ejeren kan oprette en skole');
select lives_ok(
  $$insert into public.school_members (school_id, user_id, role)
    values ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a100-000000000002', 'admin')$$,
  'Platform-ejeren kan give en person admin på den nye skole');
reset role;


select * from finish();
rollback;
