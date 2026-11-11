-- Trin 4: priser med gyldig-fra, egne priser, låst pris og regler for brugte ydelser.
-- Bygger på seed.sql: B privat (a500-…06) koster 220 kr. fra 1. januar og 235 kr. fra næste måned.
-- Lars (a200-…11) har egen pris 270 kr. på Amu C (a500-…01).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- ---------------------------------------------------------------------------
-- Prishistorik
-- ---------------------------------------------------------------------------
select is(public.service_price_on('00000000-0000-4000-a500-000000000006', current_date), 22000,
  'Prisen i dag er den gældende');
select is(public.service_price_on('00000000-0000-4000-a500-000000000006',
  (date_trunc('month', current_date) + interval '1 month')::date), 23500,
  'Fra datoen for prisændringen gælder den nye pris');
select is(public.service_price_on('00000000-0000-4000-a500-000000000006', '1999-01-01'), 22000,
  'Før første pris gælder den første pris');

-- Færdig-kriteriet: en prisændring fra en fremtidig dato påvirker ikke lektioner før datoen.
insert into public.registrations (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
values ('00000000-0000-4000-a700-000000000099', '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a500-000000000006', current_date, '08:00', 2);
-- Fjern seedens fremtidige pris, så testen ikke afhænger af, om i morgen er den 1.
delete from public.service_prices
where service_id = '00000000-0000-4000-a500-000000000006' and valid_from > current_date;
insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000006', current_date + 1, 99900);

select is(
  (select public.unit_price_ore(r) from public.registrations r where id = '00000000-0000-4000-a700-000000000099'),
  22000, 'En prisændring fra i morgen ændrer ikke dagens lektion');
select is(public.unit_price_on('00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a500-000000000006', current_date + 1),
  99900, 'Fra i morgen gælder den nye pris');

-- Låst pris (sættes ved godkendelse i trin 7) vinder over alt.
update public.registrations set status = 'approved', locked_unit_price_ore = 21000
where id = '00000000-0000-4000-a700-000000000099';
insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000006', current_date - 1, 50000);
select is(
  (select public.unit_price_ore(r) from public.registrations r where id = '00000000-0000-4000-a700-000000000099'),
  21000, 'En godkendt lektion beholder sin låste pris, også ved en prisændring bagud');

-- Lærerens egen pris vinder over ydelsens pris.
select is(public.unit_price_on('00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', current_date),
  27000, 'Lærerens egen pris bruges');
select is(public.unit_price_on('00000000-0000-4000-a200-000000000013', '00000000-0000-4000-a500-000000000001', current_date),
  26000, 'Uden egen pris bruges ydelsens pris');

-- ---------------------------------------------------------------------------
-- Brugte ydelser
-- ---------------------------------------------------------------------------
select is((select count(*) from public.services where id = '00000000-0000-4000-a500-000000000006' and active),
  1::bigint, 'B privat er i brug');
select lives_ok(
  $$update public.services set name = 'B privat (ny)' where id = '00000000-0000-4000-a500-000000000006'$$,
  'En brugt ydelse kan skifte navn');
select throws_ok(
  $$delete from public.services where id = '00000000-0000-4000-a500-000000000006'$$,
  '23503', null, 'En brugt ydelse kan ikke slettes');
select is((select payroll_code from public.services where id = '00000000-0000-4000-a500-000000000006'),
  'TEST-104', 'Dataløn-løndelen sidder på ydelsen');
select throws_ok(
  $$delete from public.service_prices where service_id = '00000000-0000-4000-a500-000000000002'$$,
  '23514', null, 'En ydelse skal have mindst én sats');

-- ---------------------------------------------------------------------------
-- Rettigheder
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000006', current_date + 30, 1)$$,
  '42501', null, 'Kontoret kan ikke ændre priser');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000001", "role": "authenticated"}', true);
select lives_ok(
  $$insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000006', current_date + 30, 1)$$,
  'Admin kan ændre priser');
reset role;

select * from finish();
rollback;
