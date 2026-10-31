-- Testdata til lokal udvikling. Køres automatisk af `npm run db:reset`.
-- Kun opdigtede personer og testpriser. Alle testbrugere har koden: Test1234!
-- Datoer er relative til i dag, så kalenderen altid har noget at vise.
--
-- Faste id'er (bruges også af tests i supabase/tests):
--   skole            00000000-0000-4000-a000-000000000001
--   brugere          00000000-0000-4000-a100-0000000000NN  (01 admin, 02 kontor, 11–19 lærere)
--   lærere           00000000-0000-4000-a200-0000000000NN  (01 og 11–19, samme NN som brugeren;
--                    Anne Admin er både admin og lærer)

-- ---------------------------------------------------------------------------
-- Brugere (auth) og profiler
-- ---------------------------------------------------------------------------
create temporary table seed_people (nn text, full_name text, phone text, role public.app_role);
insert into seed_people values
  ('01', 'Anne Admin',        '+4520000001', 'admin'),
  ('02', 'Ole Kontor',        '+4520000002', 'office'),
  ('11', 'Lars Jensen',       '+4520000011', 'instructor'),
  ('12', 'Mette Hansen',      '+4520000012', 'instructor'),
  ('13', 'Søren Nielsen',     '+4520000013', 'instructor'),
  ('14', 'Pia Andersen',      '+4520000014', 'instructor'),
  ('15', 'Jens Pedersen',     '+4520000015', 'instructor'),
  ('16', 'Hanne Christensen', '+4520000016', 'instructor'),
  ('17', 'Mads Larsen',       '+4520000017', 'instructor'),
  ('18', 'Karin Sørensen',    '+4520000018', 'instructor'),
  ('19', 'Bo Rasmussen',      '+4520000019', 'instructor');

-- Login sker med telefon + kode via en intern adresse (se src/lib/auth/login-identity.ts):
-- +4520000011 -> 4520000011@login.vixx.dk. Telefonnummeret gemmes også, så SMS-kode kan slås til senere.
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, phone, phone_confirmed_at, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  ('00000000-0000-4000-a100-0000000000' || nn)::uuid,
  'authenticated', 'authenticated',
  substr(phone, 2) || '@login.vixx.dk', now(),
  substr(phone, 2), now(),                            -- auth gemmer telefon uden "+"
  extensions.crypt('Test1234!', extensions.gen_salt('bf')),
  '{"provider": "email", "providers": ["email", "phone"]}', '{}',
  now(), now(), '', '', '', ''
from seed_people;

insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  ('00000000-0000-4000-a100-0000000000' || nn),
  ('00000000-0000-4000-a100-0000000000' || nn)::uuid,
  jsonb_build_object(
    'sub', '00000000-0000-4000-a100-0000000000' || nn,
    'email', substr(phone, 2) || '@login.vixx.dk',
    'email_verified', true
  ),
  'email', now(), now()
from seed_people;

insert into public.profiles (id, full_name, phone, must_change_password)
select ('00000000-0000-4000-a100-0000000000' || nn)::uuid, full_name, phone, false
from seed_people;

-- ---------------------------------------------------------------------------
-- Skole og medlemskaber
-- ---------------------------------------------------------------------------
insert into public.schools (id, name, lesson_minutes, pay_period_start_day)
values ('00000000-0000-4000-a000-000000000001', 'Testkøreskolen', 45, 21);

insert into public.school_members (school_id, user_id, role)
select '00000000-0000-4000-a000-000000000001', ('00000000-0000-4000-a100-0000000000' || nn)::uuid, role
from seed_people;

-- ---------------------------------------------------------------------------
-- Typer, satser og ydelser
-- ---------------------------------------------------------------------------
-- Skolen har fået standardtyper automatisk; seed bruger faste id'er, så de lægges ind forfra.
delete from public.lesson_types where school_id = '00000000-0000-4000-a000-000000000001';
insert into public.lesson_types (id, school_id, name, sort_order) values
  ('00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a000-000000000001', 'Kørsel',    10),
  ('00000000-0000-4000-a300-000000000002', '00000000-0000-4000-a000-000000000001', 'Teori',     20),
  ('00000000-0000-4000-a300-000000000003', '00000000-0000-4000-a000-000000000001', 'Manøvre',   30),
  ('00000000-0000-4000-a300-000000000004', '00000000-0000-4000-a000-000000000001', 'Glatbane',  40),
  ('00000000-0000-4000-a300-000000000005', '00000000-0000-4000-a000-000000000001', 'Køreprøve', 50),
  ('00000000-0000-4000-a300-000000000006', '00000000-0000-4000-a000-000000000001', 'Rybners',   60);

-- Løndele er pladsholdere, indtil vi har skolens Dataløn-importfil.
insert into public.rate_groups (id, school_id, name, payroll_code) values
  ('00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a000-000000000001', 'Amu kørsel',   'TEST-101'),
  ('00000000-0000-4000-a400-000000000002', '00000000-0000-4000-a000-000000000001', 'Amu teori',    'TEST-102'),
  ('00000000-0000-4000-a400-000000000003', '00000000-0000-4000-a000-000000000001', 'Teorilek.',    'TEST-103'),
  ('00000000-0000-4000-a400-000000000004', '00000000-0000-4000-a000-000000000001', 'Privatkørsel', 'TEST-104'),
  ('00000000-0000-4000-a400-000000000005', '00000000-0000-4000-a000-000000000001', 'Diverse',      'TEST-105');

-- (id-endelse, navn, sats, kategori, type, testpris i kr.)
create temporary table seed_services (nn text, name text, rate text, cat text, typ text, kr int);
insert into seed_services values
  ('01', 'Amu C',          '1', 'C',  '1', 260),
  ('02', 'Amu CE',         '1', 'CE', '1', 280),
  ('03', 'Aften Amu C/E',  '1', 'CE', '1', 310),
  ('04', 'Amu teori C',    '2', 'C',  '2', 230),
  ('05', 'B teori',        '3', 'B',  '2', 180),
  ('06', 'B privat',       '4', 'B',  '1', 220),
  ('07', 'C privat',       '4', 'C',  '1', 250),
  ('08', 'Manøvre B',      '5', 'B',  '3', 200),
  ('09', 'Glatbane B',     '5', 'B',  '4', 240),
  ('10', 'Køreprøve B',    '5', 'B',  '5', 220),
  ('11', 'Rybners C',      '5', 'C',  '6', 260);

insert into public.services (id, school_id, name, rate_group_id, category_code, lesson_type_id)
select
  ('00000000-0000-4000-a500-0000000000' || nn)::uuid,
  '00000000-0000-4000-a000-000000000001',
  name,
  ('00000000-0000-4000-a400-00000000000' || rate)::uuid,
  cat,
  ('00000000-0000-4000-a300-00000000000' || typ)::uuid
from seed_services;

-- Pris gældende fra 1. januar i år, og en prisstigning fra næste måned på B privat.
insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
select
  '00000000-0000-4000-a000-000000000001',
  ('00000000-0000-4000-a500-0000000000' || nn)::uuid,
  date_trunc('year', current_date)::date,
  kr * 100
from seed_services;

insert into public.service_prices (school_id, service_id, valid_from, amount_ore)
values (
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-a500-000000000006',
  (date_trunc('month', current_date) + interval '1 month')::date,
  23500
);

-- ---------------------------------------------------------------------------
-- Lærere og kompetencer
-- ---------------------------------------------------------------------------
insert into public.instructors (
  id, school_id, user_id, employee_number, is_guest, guest_company, availability,
  city, employed_from, instructor_license_expires
)
select
  ('00000000-0000-4000-a200-0000000000' || nn)::uuid,
  '00000000-0000-4000-a000-000000000001',
  ('00000000-0000-4000-a100-0000000000' || nn)::uuid,
  case when nn = '19' then null else '1' || nn end,
  nn = '19',
  case when nn = '19' then 'Rasmussen Kørsel ApS' end,
  case when nn = '18' then 'on_request' else 'fixed' end::public.availability_mode,
  'Testby',
  date '2020-01-01' + (nn::int * 37),
  current_date + (nn::int * 40)
from seed_people
where role = 'instructor' or nn = '01';  -- Anne Admin underviser også (flere roller)

insert into public.instructor_categories (school_id, instructor_id, category_code)
select '00000000-0000-4000-a000-000000000001', ('00000000-0000-4000-a200-0000000000' || nn)::uuid, cat
from (values
  ('01', 'B'),
  ('11', 'B'), ('11', 'C'), ('11', 'CE'),
  ('12', 'B'), ('12', 'BE'),
  ('13', 'C'), ('13', 'CE'),
  ('14', 'B'),
  ('15', 'B'), ('15', 'C'),
  ('16', 'B'), ('16', 'BE'),
  ('17', 'C'), ('17', 'CE'), ('17', 'D'),
  ('18', 'B'),
  ('19', 'C'), ('19', 'CE')
) v(nn, cat);

-- Alle lærere kan kørsel og teori; nogle kan mere.
insert into public.instructor_lesson_types (school_id, instructor_id, lesson_type_id)
select '00000000-0000-4000-a000-000000000001', i.id, t.id
from public.instructors i
cross join public.lesson_types t
where t.name in ('Kørsel', 'Teori')
   or (t.name = 'Manøvre' and i.id in ('00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a200-000000000014'))
   or (t.name = 'Glatbane' and i.id = '00000000-0000-4000-a200-000000000016')
   or (t.name = 'Køreprøve' and i.id in ('00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a200-000000000015'))
   or (t.name = 'Rybners' and i.id in ('00000000-0000-4000-a200-000000000013', '00000000-0000-4000-a200-000000000017'));

-- Lars har egen pris på Amu C.
insert into public.instructor_prices (school_id, instructor_id, service_id, amount_ore)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', 27000);

-- ---------------------------------------------------------------------------
-- Lokaler og køretøjer
-- ---------------------------------------------------------------------------
insert into public.resources (id, school_id, kind, name, vehicle_category_code) values
  ('00000000-0000-4000-a600-000000000001', '00000000-0000-4000-a000-000000000001', 'room',    'Lokale 1',            null),
  ('00000000-0000-4000-a600-000000000002', '00000000-0000-4000-a000-000000000001', 'room',    'Lokale 2',            null),
  ('00000000-0000-4000-a600-000000000003', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Personbil 1',         'B'),
  ('00000000-0000-4000-a600-000000000004', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Lastbil 1',           'C'),
  ('00000000-0000-4000-a600-000000000005', '00000000-0000-4000-a000-000000000001', 'vehicle', 'Lastbil med trailer', 'CE');

-- ---------------------------------------------------------------------------
-- Lønperioder (21.–20.): forrige, nuværende og næste
-- ---------------------------------------------------------------------------
insert into public.pay_periods (school_id, starts_on, ends_on, locked, locked_at)
select
  '00000000-0000-4000-a000-000000000001',
  p.starts_on,
  (p.starts_on + interval '1 month' - interval '1 day')::date,
  p.offset_months < 0,
  case when p.offset_months < 0 then now() end
from (
  select
    o as offset_months,
    (date_trunc('month', current_date - 20) + make_interval(months => o) + interval '20 days')::date as starts_on
  from generate_series(-1, 1) o
) p;

-- ---------------------------------------------------------------------------
-- Lektioner, registreringer, fravær, ferie og "Kan arbejde"
-- ---------------------------------------------------------------------------
insert into public.scheduled_lessons (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, student_name, origin) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', current_date - 2, '08:00', 3, 'Test Elev A', 'office'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', current_date - 1, '08:00', 4, 'Test Elev A', 'office'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000002', current_date,     '08:00', 3, 'Test Elev B', 'office'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000011', '00000000-0000-4000-a500-000000000001', current_date + 1, '10:15', 2, null,          'instructor'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a500-000000000006', current_date - 1, '08:00', 2, 'Test Elev C', 'office'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012', '00000000-0000-4000-a500-000000000008', current_date,     '13:00', 2, 'Test Elev D', 'office'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000013', '00000000-0000-4000-a500-000000000011', current_date + 2, '08:00', 4, null,          'office');

-- Registreringer: godkendt (med låst pris), afventer, afvist og en uplanlagt.
insert into public.registrations (
  school_id, instructor_id, service_id, scheduled_lesson_id, lesson_date, start_time, lesson_count,
  student_name, status, decision_comment, decided_by, decided_at, locked_unit_price_ore
)
select
  '00000000-0000-4000-a000-000000000001', l.instructor_id, l.service_id, l.id, l.lesson_date, l.start_time,
  l.lesson_count, l.student_name, 'approved', null,
  '00000000-0000-4000-a100-000000000002', now(), 27000
from public.scheduled_lessons l
where l.instructor_id = '00000000-0000-4000-a200-000000000011' and l.lesson_date = current_date - 2;

insert into public.registrations (
  school_id, instructor_id, service_id, scheduled_lesson_id, lesson_date, start_time, lesson_count, student_name
)
select
  '00000000-0000-4000-a000-000000000001', l.instructor_id, l.service_id, l.id, l.lesson_date, l.start_time,
  l.lesson_count - 1, l.student_name                  -- afvigelse: planlagt 4, registreret 3
from public.scheduled_lessons l
where l.instructor_id = '00000000-0000-4000-a200-000000000011' and l.lesson_date = current_date - 1;

insert into public.registrations (
  school_id, instructor_id, service_id, scheduled_lesson_id, lesson_date, start_time, lesson_count,
  student_name, status, decision_comment, decided_by, decided_at
)
select
  '00000000-0000-4000-a000-000000000001', l.instructor_id, l.service_id, l.id, l.lesson_date, l.start_time,
  l.lesson_count, l.student_name, 'rejected', 'Forkert ydelse – skal være Manøvre B.',
  '00000000-0000-4000-a100-000000000002', now()
from public.scheduled_lessons l
where l.instructor_id = '00000000-0000-4000-a200-000000000012' and l.lesson_date = current_date - 1;

insert into public.registrations (school_id, instructor_id, service_id, lesson_date, start_time, lesson_count, note)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000014', '00000000-0000-4000-a500-000000000005',
        current_date - 1, '16:00', 2, 'Uplanlagt teori');

insert into public.absences (school_id, instructor_id, absence_date, start_time, hours, reason, note)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000015', current_date, '08:00', 8, 'sick', null);

insert into public.holidays (school_id, instructor_id, from_date, to_date, note, status) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000016', current_date + 14, current_date + 18, 'Efterårsferie', 'pending'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000017', current_date + 30, current_date + 34, null, 'approved');

insert into public.availability (school_id, instructor_id, available_date, start_time, end_time) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000018', current_date + 1, '08:00', '14:00'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000018', current_date + 3, '12:00', '18:00');

insert into public.bookings (school_id, resource_id, booking_date, start_time, minutes, title, instructor_id)
values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a600-000000000001', current_date + 1, '17:00', 180, 'Teoriaften', '00000000-0000-4000-a200-000000000014');

insert into public.messages (school_id, recipient_instructor_id, body, sent_by) values
  ('00000000-0000-4000-a000-000000000001', null, 'Velkommen til Vixx. Husk at registrere dine lektioner samme dag.', '00000000-0000-4000-a100-000000000002'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000012', 'Din registrering fra i går er afvist – se kommentaren.', '00000000-0000-4000-a100-000000000002');

-- Seed skal ikke fremstå som ændringer i loggen.
truncate public.audit_log;

drop table seed_people, seed_services;
