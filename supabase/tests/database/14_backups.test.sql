-- Backup-adressen: kun admin ser og retter den, og ændringer logges uden selve adressen.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.school_backups (school_id, email)
values ('00000000-0000-4000-a000-000000000001', 'backup@example.com')
on conflict (school_id) do update set email = excluded.email;  -- e2e-testene kan have sat en adresse

-- Kontoret (Ole) og læreren (Lars) ser ikke adressen.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select is((select count(*) from public.school_backups), 0::bigint, 'Kontoret ser ikke backup-adressen');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select is((select count(*) from public.school_backups), 0::bigint, 'Læreren ser ikke backup-adressen');

-- Admin (Anne) ser og retter den.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select is((select email from public.school_backups), 'backup@example.com', 'Admin ser backup-adressen');
update public.school_backups set email = 'ny@example.com' where school_id = '00000000-0000-4000-a000-000000000001';
reset role;

select is(
  (select changes -> 'email' from public.audit_log where table_name = 'school_backups' and action = 'update' order by occurred_at desc limit 1),
  to_jsonb('(ændret)'::text), 'Ændringen logges uden selve adressen');
select throws_ok(
  $$update public.school_backups set email = 'ikke-en-adresse' where school_id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', null, 'En ugyldig adresse afvises');

select * from finish();
rollback;
