-- Trin E8, del 6c-1: modulplanens versioner (PDF). Kun admin lægger op og tager i brug; en version i brug kan
-- ikke ændres eller slettes; nye elever får nyeste version, elever i gang beholder deres, og kun admin flytter.
-- Seed: "B – modulplan" har den indbyggede version 1.1; Bent er B-elev, Freja er på C-forløbet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table ids as
select
  (select id from public.courses where name = 'B – modulplan') as b,
  (select id from public.module_plan_templates t where t.builtin = 'B-1.1') as b11;
grant select on ids to authenticated;

select results_eq(
  $$select version, builtin, activated_at is not null from public.module_plan_templates where course_id = (select b from ids)$$,
  $$values ('1.1', 'B-1.1', true)$$,
  'B-forløbet har den indbyggede version 1.1 i brug');
select is((select plan_template_id from public.students where id = '00000000-0000-4000-ad00-000000000033'), (select b11 from ids),
  'Bent er på version 1.1');

set local role authenticated;

-- Kontoret (Ole) kan ikke lægge en modulplan op.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.module_plan_templates (school_id, course_id, version, storage_path)
    select '00000000-0000-4000-a000-000000000001', b, '9.9', 'x.pdf' from ids$$,
  '42501', null, 'Kontoret kan ikke lægge en modulplan op');

-- Admin (Anne).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.module_plan_templates (school_id, course_id, version, storage_path)
    select '00000000-0000-4000-a000-000000000001', b, '1.2', 'skole/b-1.2.pdf' from ids$$,
  'Admin lægger version 1.2 op som kladde');
select throws_ok(
  $$update public.module_plan_templates set activated_at = now() where version = '1.2'$$,
  '23514', null, 'En opsendt version kræver et feltkort, før den tages i brug');
select lives_ok(
  $$update public.module_plan_templates set field_map = '{"student": {"name": "Elev"}}', activated_at = now() where version = '1.2'$$,
  'Admin tager version 1.2 i brug med feltkort');
select throws_ok(
  $$update public.module_plan_templates set field_map = '{}' where version = '1.2'$$,
  '23514', null, 'En version i brug kan ikke ændres');
select throws_ok(
  $$delete from public.module_plan_templates where version = '1.2'$$,
  '23514', null, 'En version i brug kan ikke slettes');

-- Version pr. elev: Freja skifter til B og får nyeste version; Bent beholder 1.1.
update public.students set course_id = (select b from ids) where id = '00000000-0000-4000-ad00-000000000032';
select is((select t.version from public.students s join public.module_plan_templates t on t.id = s.plan_template_id
  where s.id = '00000000-0000-4000-ad00-000000000032'), '1.2', 'En elev, der kommer på forløbet, får nyeste version');
select is((select plan_template_id from public.students where id = '00000000-0000-4000-ad00-000000000033'), (select b11 from ids),
  'En elev i gang beholder sin version');

-- Kun admin flytter en elev, og kun til en version i brug af elevens forløb.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$update public.students set plan_template_id = (select id from public.module_plan_templates where version = '1.2')
    where id = '00000000-0000-4000-ad00-000000000033'$$,
  '42501', null, 'Kontoret kan ikke flytte en elev til en anden version');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.students set plan_template_id = (select id from public.module_plan_templates where version = '1.2')
    where id = '00000000-0000-4000-ad00-000000000033'$$,
  'Admin flytter Bent til version 1.2');
select public.create_module_course('00000000-0000-4000-a000-000000000001', 'CE-1.1', 'Test C/E');
select throws_ok(
  $$update public.students set plan_template_id = (select t.id from public.module_plan_templates t join public.courses c on c.id = t.course_id where c.name = 'Test C/E')
    where id = '00000000-0000-4000-ad00-000000000033'$$,
  '23514', null, 'En elev kan kun flyttes til en version af sit eget forløb');

-- Tomt modulforløb (fx EU): kun admin.
select lives_ok(
  $$select public.create_empty_module_course('00000000-0000-4000-a000-000000000001', 'CE', 'C/E med EU')$$,
  'Admin opretter et tomt modulforløb (fx EU)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$select public.create_empty_module_course('00000000-0000-4000-a000-000000000001', 'CE', 'Kontorets EU')$$,
  '42501', null, 'Kontoret kan ikke oprette modulforløb');

-- Eleven ser ikke modulplanens versioner.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000033", "role": "authenticated"}', true);
select is((select count(*) from public.module_plan_templates), 0::bigint, 'Eleven ser ikke modulplanens versioner');
reset role;

select * from finish();
rollback;
