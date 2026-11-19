-- Trin E8, del 2: skabelonerne for C, C/E og D følger Færdselsstyrelsens modulplaner (version 1.1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select public.create_module_course('00000000-0000-4000-a000-000000000001', t, 'Test ' || t)
from unnest(array['B-1.1', 'C-1.1', 'CE-1.1', 'D-1.1']) t;

-- Kategori, moduler, minimum i alt (teori, kørsel, mørke) og undervisningsdage pr. plan.
select results_eq(
  $$select c.category_code, count(*)::int, sum(m.min_theory)::int, sum(m.min_driving)::int, sum(m.min_dark)::int, max(c.min_days)
    from public.courses c join public.course_modules m on m.course_id = c.id
    where c.name like 'Test %' group by c.category_code order by c.category_code$$,
  $$values ('B', 5, 30, 24, 1, 14), ('C', 3, 16, 18, 1, 12), ('CE', 3, 13, 18, 0, 10), ('D', 3, 16, 18, 1, 12)$$,
  'B, C, C/E og D har modulplanernes minimum og dage');

select results_eq(
  $$select m.number, m.min_theory, m.min_driving, m.min_dark from public.course_modules m
    join public.courses c on c.id = m.course_id where c.name = 'Test C-1.1' order by m.number$$,
  $$values (1, 8, 5, 0), (2, 7, 5, 1), (3, 1, 8, 0)$$,
  'C: 8+5 · 7+5 (1 i mørke) · 1+8');
select results_eq(
  $$select m.number, m.min_theory, m.min_driving, m.min_dark from public.course_modules m
    join public.courses c on c.id = m.course_id where c.name = 'Test CE-1.1' order by m.number$$,
  $$values (1, 7, 5, 0), (2, 5, 5, 0), (3, 1, 8, 0)$$,
  'C/E: 7+5 · 5+5 · 1+8');

-- Emnerne: C/E har påhængskøretøjet og ingen kørsel i mørke (7.19); C og D har 7.19.
select ok((select topics like '%Påhængskøretøjets indretning%' from public.course_modules m
  join public.courses c on c.id = m.course_id where c.name = 'Test CE-1.1' and m.number = 1), 'C/E modul 1: påhængskøretøjet');
select ok((select topics not like '%7.19%' from public.course_modules m
  join public.courses c on c.id = m.course_id where c.name = 'Test CE-1.1' and m.number = 2), 'C/E modul 2: ingen 7.19');
select ok((select topics like '%7.19 Kørsel i mørke%' from public.course_modules m
  join public.courses c on c.id = m.course_id where c.name = 'Test D-1.1' and m.number = 2), 'D modul 2: 7.19 kørsel i mørke');
select ok((select topics like '%Afsnit 9 – Manøvrer på køreteknisk anlæg%' from public.course_modules m
  join public.courses c on c.id = m.course_id where c.name = 'Test C-1.1' and m.number = 3), 'C modul 3: køreteknisk anlæg');

-- Kontoret kan stadig ikke oprette et modulforløb.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$select public.create_module_course('00000000-0000-4000-a000-000000000001', 'D-1.1', 'Kontorets D')$$,
  '42501', null, 'Kontoret kan ikke oprette et modulforløb');
reset role;

select * from finish();
rollback;
