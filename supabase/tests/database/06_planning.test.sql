-- Trin 5: ingen overlap, kompetence, kategori og ferie.
-- Seed: Lars (a200-…11, kategorier B/C/CE, typer Kørsel/Teori) har lektion i dag kl. 08:00–10:15 (Amu CE, 3 × 45 min).
-- Jens (…15) er syg i dag 08:00–16:00. Mads (…17) har godkendt ferie om 30–34 dage. Hanne (…16) har søgt ferie om 14–18 dage.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
            '00000000-0000-4000-a500-000000000001', current_date, '09:30', 1, 'office')$$,
  '23P01', 'Læreren har allerede en lektion kl. 08:00–10:15.', 'En lektion kan ikke overlappe en anden');

select lives_ok(
  $$insert into public.scheduled_lessons (id, school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a800-000000000001', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000001', current_date, '10:15', 2, 'office')$$,
  'En lektion lige efter en anden er tilladt');

select throws_ok(
  $$update public.scheduled_lessons set start_time = '07:00' where id = '00000000-0000-4000-a800-000000000001'$$,
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

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000015',
            '00000000-0000-4000-a500-000000000006', current_date, '16:00', 1, 'office')$$,
  'En lektion lige efter fraværet er tilladt');

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
-- Kompetence og kategori
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014',
            '00000000-0000-4000-a500-000000000001', current_date + 5, '08:00', 1, 'office')$$,
  '23514', null, 'Pia (kun B) kan ikke planlægges på Amu C');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000003', current_date + 5, '08:00', 1, 'office')$$,
  '23514', 'Vælg kategori for ydelsen.', 'En ydelse med flere kategorier kræver et valg');

select lives_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, category_code, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000003', 'CE', current_date + 5, '08:00', 1, 'office')$$,
  'Med valgt kategori kan Aften Amu C/E planlægges');

select is(
  (select category_code from public.scheduled_lessons
   where instructor_id = '00000000-0000-4000-a200-000000000015' and lesson_date = current_date and start_time = '16:00'),
  'B', 'Én kategori på ydelsen udfyldes automatisk');

select throws_ok(
  $$insert into public.scheduled_lessons (school_id, instructor_id, service_id, category_code, lesson_date, start_time, lesson_count, origin)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011',
            '00000000-0000-4000-a500-000000000003', 'B', current_date + 6, '08:00', 1, 'office')$$,
  '23514', 'Ydelsen dækker ikke kategori B.', 'Kategorien skal høre til ydelsen');
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
