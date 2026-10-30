-- Sessioner: kun serveren kan logge brugere ud; en bruger kan kun spørge til sin egen session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role anon;
select throws_ok('select public.session_is_active()', '42501', null, 'Anonym kan ikke kalde session_is_active');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select throws_ok(
  $$select public.revoke_user_sessions('00000000-0000-4000-a100-000000000011')$$,
  '42501', null, 'Selv admin kan ikke logge andre ud direkte fra databasen');
select is(public.session_is_active(), false, 'Uden session_id i tokenet er sessionen ikke aktiv');
reset role;

set local role service_role;
select lives_ok(
  $$select public.revoke_user_sessions('00000000-0000-4000-a100-000000000011')$$,
  'Serveren kan logge en bruger ud af alle enheder');
reset role;

select * from finish();
rollback;
