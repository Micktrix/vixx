-- Det hemmelige kalender-link: hver lærer har sit eget, og ændringsloggen gemmer aldrig selve værdien.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(distinct calendar_token) from public.instructors),
  (select count(*) from public.instructors),
  'Hver lærer har sit eget kalender-link');

update public.instructors set calendar_token = gen_random_uuid() where id = '00000000-0000-4000-a200-000000000011';
select is(
  (select changes ->> 'calendar_token' from public.audit_log
    where table_name = 'instructors' and changes ? 'calendar_token' order by id desc limit 1),
  '(ændret)', 'Ændringsloggen gemmer ikke selve linket');

select * from finish();
rollback;
