-- Flere elever på én time (fx KTA): lektionen kommer i hver elevs kalender, og eleverne skal være skolens.
-- Seed: Lars (lærer a200-…11, bruger a100-…11), Emil (ad00-…31, bruger a100-…31), Freja (ad00-…32, bruger a100-…32).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, student_ids, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001',
            current_date + 9, '08:00', 4,
            array['00000000-0000-4000-ad00-000000000031', '00000000-0000-4000-ad00-000000000032', '00000000-0000-4000-ad00-000000000031']::uuid[],
            'instructor')$$,
  'Læreren planlægger KTA med to elever');
select is((select cardinality(student_ids) from public.scheduled_lessons where lesson_date = current_date + 9), 2,
  'Dubletter fjernes');
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, student_ids, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001',
            current_date + 10, '08:00', 1, array[gen_random_uuid()], 'instructor')$$,
  '23514', 'Eleven findes ikke på skolen.', 'Kun skolens elever');

-- Begge elever ser lektionen i deres kalender.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);
select is((select count(*) from public.student_lessons('00000000-0000-4000-a000-000000000001') where lesson_date = current_date + 9), 1::bigint,
  'Emil ser KTA-lektionen');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000032", "role": "authenticated"}', true);
select is((select count(*) from public.student_lessons('00000000-0000-4000-a000-000000000001') where lesson_date = current_date + 9), 1::bigint,
  'Freja ser KTA-lektionen');
reset role;

select * from finish();
rollback;
