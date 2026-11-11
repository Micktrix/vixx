-- Trin 5: ingen overlap, ydelser i brug og ferie.
-- Seed: Lars (a200-…11) har lektion i dag kl. 08:00–10:45 (Amu CE, 3 lektioner efter lektionsplanen med pause 09:30–10:00).
-- Jens (…15) er syg i dag 08:00–16:00. Mads (…17) har godkendt ferie om 30–34 dage. Hanne (…16) har søgt ferie om 14–18 dage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Uafhængig af manuelle afprøvninger: kun seedens lektion kl. 08:00 for Lars i dag.
delete from public.scheduled_lessons
where instructor_id = '00000000-0000-4000-a200-000000000011' and lesson_date = current_date and start_time <> '08:00';

-- Som kontoret (Ole), så reglerne for appens brugere gælder.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Overlap
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date, '08:45', 1, 'office')$$,
  '23P01', 'Læreren har allerede en lektion kl. 08:00–10:45.', 'En lektion kan ikke overlappe en anden');

select lives_ok(
  $$insert into public.scheduled_lessons (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a800-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date, '10:45', 2, 'office')$$,
  'En lektion lige efter en anden er tilladt');

select is(
  (select end_time from public.scheduled_lessons where id = '00000000-0000-4000-a800-000000000001'),
  '12:45'::time, 'To lektioner fra 10:45 følger planen med pausen 11:30–12:00');

select throws_ok(
  $$update public.scheduled_lessons set start_time = '08:00' where id = '00000000-0000-4000-a800-000000000001'$$,
  '23P01', null, 'En lektion kan ikke flyttes ind over en anden');

select lives_ok(
  $$update public.scheduled_lessons set note = 'Husk papirer' where id = '00000000-0000-4000-a800-000000000001'$$,
  'En note kan rettes uden overlap-tjek');

select throws_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date, '11:00', 2, 'off')$$,
  '23P01', null, 'Fravær kan ikke ligge oven i en lektion');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000015',
            '00000000-0000-4000-a500-000000000006', current_date, '12:00', 1, 'office')$$,
  '23P01', 'Læreren har fravær kl. 08:00–16:00.', 'En lektion kan ikke ligge i et fravær');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000015',
            '00000000-0000-4000-a500-000000000006', current_date + 3, '16:00', 1, 'office')$$,
  '23514', null, 'En starttid uden for lektionsplanen afvises');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000017',
            '00000000-0000-4000-a500-000000000001', current_date + 31, '08:00', 1, 'office')$$,
  '23P01', 'Læreren har ferie den dag.', 'En lektion kan ikke ligge i godkendt ferie');

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000016',
            '00000000-0000-4000-a500-000000000006', current_date + 15, '08:00', 1, 'office')$$,
  'En lektion i søgt (ikke godkendt) ferie er tilladt');

-- ---------------------------------------------------------------------------
-- Ferie kan ikke godkendes med lektioner i perioden
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.holidays set status = 'approved'
    where instructor_id = '00000000-0000-4000-a200-000000000016' and status = 'pending'$$,
  '23P01', null, 'Ferie med lektioner i perioden kan ikke godkendes');

delete from public.scheduled_lessons
where instructor_id = '00000000-0000-4000-a200-000000000016' and lesson_date = current_date + 15;
select lives_ok(
  $$update public.holidays set status = 'approved'
    where instructor_id = '00000000-0000-4000-a200-000000000016' and status = 'pending'$$,
  'Uden lektioner kan ferien godkendes');

-- ---------------------------------------------------------------------------
-- Ydelser: alle aktive lærere kan alle ydelser i brug
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014',
            '00000000-0000-4000-a500-000000000001', current_date + 5, '08:00', 1, 'office')$$,
  'Enhver aktiv lærer kan planlægges på enhver ydelse');
reset role;

update public.services set active = false where id = '00000000-0000-4000-a500-000000000009';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000009', current_date + 5, '12:00', 1, 'office')$$,
  '23514', 'Ydelsen er slået fra og kan ikke vælges.', 'En ydelse, der er slået fra, kan ikke vælges');
reset role;

-- ---------------------------------------------------------------------------
-- Adgang før overlap: en anden skole må ikke kunne se, hvornår læreren er optaget
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, phone) values
  ('00000000-0000-4000-c100-000000000002', 'authenticated', 'authenticated', '4540000002');
insert into public.profiles (id, full_name, phone) values ('00000000-0000-4000-c100-000000000002', 'Kontor C', '+4540000002');
insert into public.schools (id, name) values ('00000000-0000-4000-c000-000000000001', 'Tredje Køreskole');
insert into public.school_members (school_id, user_id, role) values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-c100-000000000002', 'office');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-c100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', current_date, '08:00', 1, 'off')$$,
  '42501', null, 'En anden skole får adgang nægtet, ikke lærerens skema');
reset role;

-- Læreren selv kan ikke lægge en lektion som "kontoret".
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date + 7, '08:00', 1, 'office')$$,
  '42501', null, 'Læreren kan ikke oprette en lektion som kontoret');
reset role;

select * from finish();
rollback;
