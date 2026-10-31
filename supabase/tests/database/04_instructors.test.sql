-- Trin 3: flere roller, gæsteadgang der udløber, deaktivering og typer.
-- Bygger på seed.sql: Anne Admin (01) er både admin og lærer, Bo (19) er gæst, Lars (11) er lærer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ---------------------------------------------------------------------------
-- Standardtyper
-- ---------------------------------------------------------------------------
insert into public.schools (id, name) values ('00000000-0000-4000-c000-000000000001', 'Ny Køreskole');
select is(
  (select count(*) from public.lesson_types where school_id = '00000000-0000-4000-c000-000000000001'),
  6::bigint, 'En ny skole får de seks standardtyper');

-- ---------------------------------------------------------------------------
-- Admin, der også er lærer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select ok((select count(*) from public.instructors) >= 10, 'Admin, der også er lærer, ser stadig alle lærere');
select ok('00000000-0000-4000-a200-000000000001' in (select private.my_instructor_ids()),
  'Admin, der også er lærer, har sit lærerkort');
reset role;

-- Lærerrollen fjernes: kontoradgangen bliver, lærerkortet gælder ikke længere.
update public.instructors set active = false where id = '00000000-0000-4000-a200-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select ok(private.is_admin('00000000-0000-4000-a000-000000000001'), 'Uden lærerrollen er man stadig admin');
select is((select count(*) from private.my_instructor_ids()), 0::bigint, 'Uden lærerrollen er man ikke længere lærer');
reset role;

-- ---------------------------------------------------------------------------
-- Gæst med "aktiv til"
-- ---------------------------------------------------------------------------
update public.instructors set active_until = private.today_dk() where id = '00000000-0000-4000-a200-000000000019';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000019", "role": "authenticated"}', true);
select is((select count(*) from public.schools), 1::bigint, 'Gæsten har adgang til og med sidste dag');
reset role;

update public.instructors set active_until = private.today_dk() - 1 where id = '00000000-0000-4000-a200-000000000019';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000019", "role": "authenticated"}', true);
select is((select count(*) from public.schools), 0::bigint, 'Udløbet gæst ser ikke skolen');
select is((select count(*) from public.instructors), 0::bigint, 'Udløbet gæst ser ikke sit lærerkort');
select is((select count(*) from public.registrations), 0::bigint, 'Udløbet gæst ser ingen registreringer');
reset role;

-- ---------------------------------------------------------------------------
-- Læreren selv
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select lives_ok(
  $$update public.instructors set next_of_kin_name = 'Grethe Jensen' where id = '00000000-0000-4000-a200-000000000011'$$,
  'Læreren kan rette sin pårørende');
select throws_ok(
  $$update public.instructors set active_until = '2099-01-01' where id = '00000000-0000-4000-a200-000000000011'$$,
  '42501', null, 'Læreren kan ikke ændre sin egen adgang');
select throws_ok(
  $$update public.instructors set availability = 'on_request' where id = '00000000-0000-4000-a200-000000000011'$$,
  '42501', null, 'Læreren kan ikke ændre sin tilgængelighed');
reset role;

-- ---------------------------------------------------------------------------
-- Kontoret: deaktivering og typer
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
update public.school_members set active = false
where school_id = '00000000-0000-4000-a000-000000000001' and user_id = '00000000-0000-4000-a100-000000000012';
update public.school_members set active = false
where school_id = '00000000-0000-4000-a000-000000000001' and user_id = '00000000-0000-4000-a100-000000000001';
select throws_ok(
  $$insert into public.lesson_types (school_id, name) values ('00000000-0000-4000-a000-000000000001', 'Kran')$$,
  '42501', null, 'Kontoret kan ikke oprette typer');
reset role;

select is(
  (select active from public.school_members
   where school_id = '00000000-0000-4000-a000-000000000001' and user_id = '00000000-0000-4000-a100-000000000012'),
  false, 'Kontoret kan deaktivere en lærer');
select is(
  (select active from public.school_members
   where school_id = '00000000-0000-4000-a000-000000000001' and user_id = '00000000-0000-4000-a100-000000000001'),
  true, 'Kontoret kan ikke deaktivere admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000012", "role": "authenticated"}', true);
select is((select count(*) from public.schools), 0::bigint, 'Deaktiveret lærer ser ikke skolen');
reset role;

select * from finish();
rollback;
