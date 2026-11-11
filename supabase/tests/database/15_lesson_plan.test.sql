-- Lektionsplanen: lektioner følger skolens faste tider med pauser.
-- Standardplan: 08:00 08:45 | 10:00 10:45 | 12:00 12:45 | 13:45 14:30, lektioner à 45 min.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is(private.lesson_span('{08:00,08:45,10:00,10:45,12:00,12:45,13:45,14:30}', '08:00', 8, 45), 435,
  '8 lektioner fra 08:00 slutter 15:15 (med pauserne)');
select is(private.lesson_span('{08:00,08:45,10:00,10:45,12:00,12:45,13:45,14:30}', '08:00', 2, 45), 90,
  'To lektioner fra 08:00 slutter 09:30');
select is(private.lesson_span('{08:00,08:45,10:00,10:45,12:00,12:45,13:45,14:30}', '14:30', 3, 45), 135,
  'Ud over planen fortsætter lektionerne uden pause');

select throws_ok(
  $$update public.schools set lesson_starts = '{08:00,08:30}' where id = '00000000-0000-4000-a000-000000000001'$$,
  '23514', 'Lektionen kl. 08:30 starter, før lektionen kl. 08:00 er slut.', 'Lektioner i planen må ikke overlappe');

-- Læreren (Lars) registrerer selv: kun planens starttider.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000006', current_date - 5, '09:00', 1)$$,
  '23514', null, 'Læreren kan ikke starte uden for planen');
select lives_ok(
  $$insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000006', current_date - 5, '12:00', 2)$$,
  'Læreren kan registrere fra planens starttider');
reset role;

select * from finish();
rollback;
