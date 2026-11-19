-- Lærerens underskrift: kun læreren selv ser og retter den; stregerne kan ikke indeholde kode; loggen
-- skriver ikke stregerne. Seed: Lars lærer (a100-…11), Pia lærer (a100-…14), Anne admin (…01), Ole kontor (…02).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a100-0000000000' || p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('11');
select lives_ok(
  $$insert into public.instructor_signatures (school_id, user_id, strokes)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000011', 'M 10 10 L 50 60 L 90 20')$$,
  'Læreren gemmer sin underskrift');
select throws_ok(
  $$update public.instructor_signatures set strokes = '<script>alert(1)</script>'$$,
  '23514', null, 'Underskriften kan kun være streger');
select throws_ok(
  $$insert into public.instructor_signatures (school_id, user_id, strokes)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a100-000000000014', 'M 10 10 L 50 60')$$,
  '42501', null, 'Man kan ikke gemme en underskrift for en anden lærer');

select pg_temp.as_user('14');
select is((select count(*) from public.instructor_signatures), 0::bigint, 'En anden lærer kan ikke se underskriften');
with u as (update public.instructor_signatures set strokes = 'M 1 1 L 2 2 L 3 3' returning 1)
select is((select count(*) from u), 0::bigint, 'En anden lærer kan ikke rette underskriften');

select pg_temp.as_user('01');
select is((select count(*) from public.instructor_signatures), 0::bigint, 'Admin kan ikke se lærerens underskrift');
select pg_temp.as_user('02');
select is((select count(*) from public.instructor_signatures), 0::bigint, 'Kontoret kan ikke se lærerens underskrift');
reset role;

select is(
  (select changes ->> 'strokes' from public.audit_log where table_name = 'instructor_signatures' order by id desc limit 1),
  '(skjult)', 'Ændringsloggen skriver ikke stregerne');

select * from finish();
rollback;
