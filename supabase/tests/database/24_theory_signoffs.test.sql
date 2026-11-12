-- Teori som tæller: læreren kvitterer som sig selv, admin kan give teori med kommentar og rette antallet,
-- og en teori-kvittering kan ikke slettes. Seed: Emil (ad00-…31), Lars (a100-…11, a200-…11), Ole kontor
-- (a100-…02), Anne admin (a100-…01).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.theory_signoffs (school_id, student_id, instructor_id, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', '00000000-0000-4000-a200-000000000012', 2)$$,
  '42501', null, 'Læreren kan ikke kvittere som en anden');
select lives_ok(
  $$insert into public.theory_signoffs (school_id, student_id, instructor_id, lesson_count, lesson_date)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', '00000000-0000-4000-a200-000000000011', 2, current_date - 10)$$,
  'Læreren kvitterer for 2 teorilektioner');
select is((select (instructor_name, lesson_date = private.today_dk())::text from public.theory_signoffs), '("Lars Jensen",t)',
  'Navn og dato sættes af databasen');
update public.theory_signoffs set lesson_count = 4;
select is((select lesson_count from public.theory_signoffs), 2, 'Læreren kan ikke rette antallet');

-- Kontoret kan hverken give teori uden lærer eller rette.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.theory_signoffs (school_id, student_id, lesson_count, comment)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', 2, 'Gæst')$$,
  '42501', null, 'Kontoret kan ikke give teori');

-- Admin retter antallet og kan ikke slette.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok($$update public.theory_signoffs set lesson_count = 3$$, 'Admin retter antallet');
select throws_ok($$update public.theory_signoffs set comment = 'x'$$, '42501', 'Kun antallet kan rettes.', 'Kun antallet kan rettes');
select throws_ok($$delete from public.theory_signoffs$$, '42501', null, 'En teori-kvittering kan ikke slettes');
reset role;

select * from finish();
rollback;
