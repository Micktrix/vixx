-- Lærernes private oplysninger: kontoret ser lærerlisten, men ikke adresse, pårørende eller kalender-link.
-- Seed: Ole kontor (a100-…02), Anne admin (…01), Lars lærer (a200-…11 / a100-…11).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

update public.instructors set address = 'Testvej 1', next_of_kin_name = 'Grethe Test'
where id = '00000000-0000-4000-a200-000000000011';

set local role authenticated;

-- Kontoret
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select ok((select count(*) from public.instructors) > 0, 'Kontoret ser lærerlisten');
select throws_ok($$select address from public.instructors$$, '42501', null, 'Kontoret kan ikke læse adresser');
select throws_ok($$select calendar_token from public.instructors$$, '42501', null, 'Kontoret kan ikke læse kalender-links');
select is((select count(*) from public.instructor_private('00000000-0000-4000-a200-000000000011')), 0::bigint,
  'Kontoret får intet fra instructor_private');

-- Admin
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select is((select next_of_kin_name from public.instructor_private('00000000-0000-4000-a200-000000000011')), 'Grethe Test',
  'Admin ser pårørende');
select is((select calendar_token from public.instructor_private('00000000-0000-4000-a200-000000000011')), null,
  'Admin ser ikke lærerens kalender-link');

-- Læreren selv
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select address from public.instructor_private('00000000-0000-4000-a200-000000000011')), 'Testvej 1',
  'Læreren ser sin egen adresse');
select isnt((select calendar_token from public.instructor_private('00000000-0000-4000-a200-000000000011')), null,
  'Læreren ser sit eget kalender-link');

select * from finish();
rollback;
