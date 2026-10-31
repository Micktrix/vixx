-- Trin 7: godkendelse låser prisen, og senere prisændringer rører den ikke.
-- Seed: Lars (a200-…11) har en afventende registrering i går (Amu C, 3 lek.) og egen pris 270 kr. på Amu C.
-- Pia (…14) har en afventende uplanlagt "B teori" i går (180 kr.).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- En registrering før første pris (som betroet seed).
insert into public.registrations (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
values ('00000000-0000-4000-a700-000000000088', '00000000-0000-4000-a000-000000000001',
        '00000000-0000-4000-a200-000000000014', '00000000-0000-4000-a500-000000000005', '2000-01-03', '08:00', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

-- Godkend Lars' registrering og prøv at sende en anden pris med.
update public.registrations set status = 'approved', locked_unit_price_ore = 1
where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1 and status = 'pending';

select is(
  (select locked_unit_price_ore from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1),
  27000, 'Godkendelse låser lærerens egen pris; en pris fra klienten ignoreres');
select is(
  (select decided_by from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1),
  '00000000-0000-4000-a100-000000000002'::uuid, 'Det gemmes, hvem der godkendte');
select ok(
  (select decided_at > now() - interval '1 minute' from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1),
  'Det gemmes, hvornår der blev godkendt');
reset role;

-- Færdig-kriteriet: senere prisændringer (egen pris og ydelsens pris bagud) ændrer ikke det godkendte beløb.
update public.instructor_prices set amount_ore = 99900
where instructor_id = '00000000-0000-4000-a200-000000000011' and service_id = '00000000-0000-4000-a500-000000000001';
insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a500-000000000001', current_date - 10, 88800);
select is(
  (select public.unit_price_ore(r) from public.registrations r
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1),
  27000, 'Godkendt beløb ændrer sig ikke ved senere prisændring');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

select lives_ok(
  $$update public.registrations set note = 'Set af kontoret'
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1$$,
  'En godkendt registrering kan få en note');
select is(
  (select locked_unit_price_ore from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 1),
  27000, 'En note ændrer ikke den låste pris');

-- Uden egen pris: ydelsens pris på datoen.
update public.registrations set status = 'approved'
where instructor_id = '00000000-0000-4000-a200-000000000014' and lesson_date = current_date - 1;
select is(
  (select locked_unit_price_ore from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000014' and lesson_date = current_date - 1),
  18000, 'Uden egen pris låses ydelsens pris på lektionens dato');

-- Kontoret retter ydelsen på en godkendt registrering: prisen låses igen.
update public.registrations set service_id = '00000000-0000-4000-a500-000000000006', category_code = 'B'
where instructor_id = '00000000-0000-4000-a200-000000000014' and lesson_date = current_date - 1;
select is(
  (select locked_unit_price_ore from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000014' and lesson_date = current_date - 1),
  22000, 'Ny ydelse på en godkendt registrering låser den nye pris');
select ok(
  (select office_edited_by is not null from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000014' and lesson_date = current_date - 1),
  'Det gemmes, at kontoret har rettet');

-- Afvisning kræver kommentar.
select throws_ok(
  $$update public.registrations set status = 'rejected'
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 2$$,
  '23514', 'Skriv en kommentar til læreren.', 'Afvisning uden kommentar afvises');
select lives_ok(
  $$update public.registrations set status = 'rejected', decision_comment = 'Forkert antal'
    where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 2$$,
  'Afvisning med kommentar');
select is(
  (select locked_unit_price_ore from public.registrations
   where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date - 2),
  null, 'En afvist registrering har ingen låst pris');

-- Før ydelsens første pris: den første pris låses (fx en ny ydelse med "gælder fra i dag").
update public.registrations set status = 'approved' where id = '00000000-0000-4000-a700-000000000088';
select is((select locked_unit_price_ore from public.registrations where id = '00000000-0000-4000-a700-000000000088'),
  18000, 'En lektion fra før ydelsens første pris godkendes med den første pris');
reset role;

select * from finish();
rollback;
