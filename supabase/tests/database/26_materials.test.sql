-- Vidensbank: private materialer ses kun af ejeren; skolens mapper oprettes kun af admin; delte materialer ses
-- af alle lærere og kontor; kun ejeren eller admin/kontor sletter; elever ser intet.
-- Seed: Anne admin (a100-…01), Ole kontor (a100-…02), Lars lærer (a100-…11), Pia lærer (a100-…14), Emil elev (a100-…31).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create temporary table ids (folder uuid, material uuid);
insert into ids values (null, null);
grant select, update on ids to authenticated;

set local role authenticated;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a100-0000000000' || p, 'role', 'authenticated')::text, true);
$$;

-- Kun admin opretter mapper.
select pg_temp.as_user('02');
select throws_ok($$insert into public.material_folders (school_id, name) values ('00000000-0000-4000-a000-000000000001', 'Taxa')$$,
  '42501', null, 'Kontoret kan ikke oprette mapper');
select pg_temp.as_user('01');
select lives_ok($$insert into public.material_folders (school_id, name) values ('00000000-0000-4000-a000-000000000001', 'Taxa')$$,
  'Admin opretter mappen Taxa');
update ids set folder = (select id from public.material_folders where name = 'Taxa');

-- Lars lægger et privat link op.
select pg_temp.as_user('11');
select lives_ok(
  $$insert into public.materials (school_id, title, kind, url) values ('00000000-0000-4000-a000-000000000001', 'Taxiregler', 'link', 'https://example.com')$$,
  'Læreren lægger et privat link op');
update ids set material = (select id from public.materials where title = 'Taxiregler');
select is((select owner_name from public.materials), 'Lars Jensen', 'Ejeren sættes af databasen');

select pg_temp.as_user('14');
select is((select count(*) from public.materials), 0::bigint, 'En anden lærer ser ikke private materialer');

-- Lars deler det i mappen; nu ser Pia det, men kan ikke slette det.
select pg_temp.as_user('11');
update public.materials set folder_id = (select folder from ids);
select pg_temp.as_user('14');
select is((select count(*) from public.materials), 1::bigint, 'Delte materialer ses af alle lærere');
delete from public.materials;
select is((select count(*) from public.materials), 1::bigint, 'En anden lærer kan ikke slette');
update public.materials set folder_id = null;
select is((select count(*) from public.materials where folder_id is not null), 1::bigint, 'En anden lærer kan ikke flytte det');
select pg_temp.as_user('01');
select throws_ok($$update public.materials set folder_id = null$$, '42501', 'Kun ejeren kan gøre et materiale privat.', 'Kun ejeren kan gøre materialet privat igen');

-- Eleven ser hverken mapper eller materialer.
select pg_temp.as_user('31');
select is((select count(*) from public.materials) + (select count(*) from public.material_folders), 0::bigint, 'Elever ser ingenting');

-- En mappe med indhold kan ikke slettes; kun admin rydder op i delte materialer.
select pg_temp.as_user('01');
select throws_ok($$delete from public.material_folders$$, '23514', 'Mappen har indhold og kan kun lukkes, ikke slettes.', 'Mappe med indhold kan ikke slettes');
select pg_temp.as_user('02');
delete from public.materials;
select is((select count(*) from public.materials), 1::bigint, 'Kontoret kan ikke slette andres delte materialer');
select pg_temp.as_user('01');
delete from public.materials;
select is((select count(*) from public.materials), 0::bigint, 'Admin kan slette delte materialer');
select lives_ok($$delete from public.material_folders$$, 'En tom mappe kan slettes');
reset role;

select * from finish();
rollback;
