-- Trin 8: kontoret låser, kun admin låser op.
-- Seed: forrige lønperiode er låst, den nuværende er åben.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Kontoret (Ole).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

update public.pay_periods set locked = true
where school_id = '00000000-0000-4000-a000-000000000001' and not locked and starts_on <= current_date and ends_on >= current_date;
select is(
  (select locked_by from public.pay_periods
   where school_id = '00000000-0000-4000-a000-000000000001' and starts_on <= current_date and ends_on >= current_date),
  '00000000-0000-4000-a100-000000000002'::uuid, 'Kontoret kan låse, og det gemmes hvem');

select throws_ok(
  $$update public.pay_periods set locked = false
    where school_id = '00000000-0000-4000-a000-000000000001' and starts_on <= current_date and ends_on >= current_date$$,
  '42501', 'Kun admin kan låse en lønperiode op.', 'Kontoret kan ikke låse op');

select throws_ok(
  $$update public.pay_periods set ends_on = ends_on + 1
    where school_id = '00000000-0000-4000-a000-000000000001' and starts_on <= current_date and ends_on >= current_date$$,
  '42501', null, 'Kontoret kan ikke ændre datoerne');

-- Låst: en registrering i perioden kan ikke godkendes eller ændres.
select throws_ok(
  $$update public.registrations set status = 'approved'
    where school_id = '00000000-0000-4000-a000-000000000001' and status = 'pending' and lesson_date = current_date - 1$$,
  '23514', 'Lønperioden er låst. Kontakt kontoret, hvis noget skal rettes.', 'I en låst periode kan intet godkendes');
reset role;

-- Admin (Anne) låser op.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$update public.pay_periods set locked = false
    where school_id = '00000000-0000-4000-a000-000000000001' and starts_on <= current_date and ends_on >= current_date$$,
  'Admin kan låse op');
select is(
  (select locked_at from public.pay_periods
   where school_id = '00000000-0000-4000-a000-000000000001' and starts_on <= current_date and ends_on >= current_date),
  null, 'Oplåst periode har ingen låsetid');
reset role;

select ok(
  exists (select 1 from public.audit_log where table_name = 'pay_periods' and action = 'update'),
  'Låsning og oplåsning står i ændringsloggen');

select * from finish();
rollback;
