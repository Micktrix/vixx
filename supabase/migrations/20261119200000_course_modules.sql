-- Trin E8, del 1: forløb som moduler efter Færdselsstyrelsens modulplan (19. nov. 2026).
-- Et forløb er enten en lektionsplan (som før, `course_lessons`) eller en modulplan (`course_modules`).
-- Et modul har nummer, navn, minimum teori, minimum kørsel (heraf i mørke) og emner (afsnit), som på
-- modulplanen. Forløbet har modulplanens version og minimum antal undervisningsdage (B: 14).
-- Admin opretter forløbet fra en skabelon (først B, version 1.1) og kan rette det; alle på skolen kan se det.
-- Eleven ser kun modulerne i sit eget forløb.
-- Kommer senere: tælling pr. modul, afslutning af modul, PDF-udfyldning, andre kategorier.

alter table public.courses
  add column plan_kind text not null default 'lessons' check (plan_kind in ('lessons', 'modules')),
  add column plan_version text check (char_length(plan_version) <= 20),          -- fx "1.1"
  add column min_days int check (min_days between 0 and 100);                       -- minimum undervisningsdage

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_id uuid not null,
  number int not null check (number between 1 and 20),
  name text not null check (char_length(name) between 1 and 120),        -- fx "Grundlæggende trafikforståelse"
  min_theory int not null default 0 check (min_theory between 0 and 100),
  min_driving int not null default 0 check (min_driving between 0 and 100),
  min_dark int not null default 0 check (min_dark between 0 and 100),    -- heraf kørsel i mørke
  topics text check (char_length(topics) <= 4000),                        -- én linje pr. emne/afsnit
  notes text check (char_length(notes) <= 1000),                          -- fx "Afsnit 0 skal gennemføres før …"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_dark <= min_driving),
  unique (course_id, number),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index course_modules_school_idx on public.course_modules (school_id);

-- Moduler kun i et modulforløb og lektioner kun i et lektionsforløb. Forløbets type kan ikke ændres.
create function private.check_course_plan_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
begin
  select plan_kind into v_kind from public.courses where id = new.course_id;
  if tg_table_name = 'course_modules' and v_kind is distinct from 'modules' then
    raise exception 'Forløbet er ikke en modulplan' using errcode = '23514';
  end if;
  if tg_table_name = 'course_lessons' and v_kind is distinct from 'lessons' then
    raise exception 'Forløbet er en modulplan og har ingen lektioner' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_plan_kind before insert or update of course_id on public.course_modules
  for each row execute function private.check_course_plan_kind();
create trigger check_plan_kind before insert or update of course_id on public.course_lessons
  for each row execute function private.check_course_plan_kind();

create function private.keep_course_plan_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_kind is distinct from old.plan_kind then
    raise exception 'Forløbets type kan ikke ændres' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger keep_plan_kind before update of plan_kind on public.courses
  for each row execute function private.keep_course_plan_kind();

-- Elevens eget forløb (aktiv elev).
create function private.is_own_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.course_id = p_course and s.user_id = (select auth.uid()) and s.active
  );
$$;
revoke all on function private.is_own_course(uuid) from public, anon;
grant execute on function private.is_own_course(uuid) to authenticated, service_role;

alter table public.course_modules enable row level security;
revoke all on public.course_modules from anon, authenticated;
grant select, insert, update, delete on public.course_modules to authenticated;
grant all on public.course_modules to service_role;

create policy "Medlemmer ser forløbets moduler" on public.course_modules
  for select to authenticated using (private.is_member(school_id));
create policy "Eleven ser modulerne i sit eget forløb" on public.course_modules
  for select to authenticated using (private.is_own_course(course_id));
create policy "Admin opretter moduler" on public.course_modules
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter moduler" on public.course_modules
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter moduler" on public.course_modules
  for delete to authenticated using (private.is_admin(school_id));

create trigger set_updated_at before update on public.course_modules
  for each row execute function private.set_updated_at();
create trigger write_audit after insert or update or delete on public.course_modules
  for each row execute function private.write_audit();

-- Opret et modulforløb fra Færdselsstyrelsens modulplan. Kører som den, der kalder (RLS gælder), så kun
-- admin kan oprette. Skabelonerne ligger her, så app, seed og tests bruger det samme indhold.
-- Emnerne er skrevet af fra "Modulplan kategori B, version 1.1 april 2026". * = se modulets note.
create function public.create_module_course(p_school_id uuid, p_template text, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_course uuid;
begin
  if p_template is distinct from 'B-1.1' then
    raise exception 'Ukendt modulplan: %', p_template using errcode = '22023';
  end if;

  insert into public.courses (school_id, category_code, name, plan_kind, plan_version, min_days)
  values (p_school_id, 'B', p_name, 'modules', '1.1', 14)
  returning id into v_course;

  insert into public.course_modules (school_id, course_id, number, name, min_theory, min_driving, min_dark, topics, notes)
  values
    (p_school_id, v_course, 1, 'Grundlæggende trafikforståelse', 7, 0, 0,
     E'Afsnit 0 – Indledning*\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.1 Køreundervisning mv.*\nAfsnit 3 – Køretøjers manøvreegenskaber\nAfsnit 4 – Trafikantadfærd\nAfsnit 5 (uddrag) – Vejforhold\n5.1 Vejenes sikkerhedsmæssige udformning\nAfsnit 6 (uddrag) – Grundregler for færdsel\n6.1 Anvisninger for færdslen\n6.2.1 Grundregler for færdslen\n6.2.2 Fare, ulempe og unødig ulempe\n6.2.9 Færdselsulykke\n6.2.10 Forsikringspligt\n6.2.11 Overladelse af køretøj til andre',
     '* Afsnit 0 (Indledning) og 10.1.1 (Køreundervisning mv.) skal gennemføres før øvrige emner i modul 1.'),
    (p_school_id, v_course, 2, 'Forberedende teori- og kørselsmodul', 5, 3, 0,
     E'Afsnit 1 – Køretøjets indretning, udstyr, betjening og dokumenter\nAfsnit 2 – Manøvrer på lukket øvelsesplads\nAfsnit 5 (uddrag) – Vejforhold\n5.2 Risikoforhold ved vejene\nAfsnit 6 (uddrag) – Grundregler for færdsel\n6.2.3 Signalgivning\n6.2.4 Tegngivning\n6.2.5 Brug af lys\n6.2.6 Fri passage for bestemte trafikanter\n6.2.7 Personer og gods mv.\n6.2.8 Motorstop og slæbning mv.',
     null),
    (p_school_id, v_course, 3, 'Grundlæggende teori- og kørselsmodul på vej', 8, 6, 0,
     E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.1 Igangsætning og standsning ved kørebanekant*\n7.2 Placering under ligeudkørsel*\n7.3 Hastighed under ligeudkørsel*\n7.6 Kørsel forbi holdende køretøjer og gående mv.*\n7.7 Møde*\n7.8 Kørsel foran eller efter andre*\n7.4 Vognbaneskift og sammenfletning (mindre trafikeret vej)\n7.10 Kørsel i trafiksanerede områder\n7.11 Fremkørsel mod kryds (mindre trafikeret vej)\n7.12 Ligeudkørsel i kryds (mindre trafikeret vej)\n7.13 Højresving i kryds (mindre trafikeret vej)\n7.14 Venstresving i kryds (mindre trafikeret vej)\n7.15 Kørsel i rundkørsel (mindre trafikeret vej)',
     '* Eleven skal have gennemført afsnit 7.1–7.3 og 7.6–7.8 i praksis, før øvrige emner i praksis kan påbegyndes.'),
    (p_school_id, v_course, 4, 'Udvidet teori- og kørselsmodul på vej', 9, 6, 1,
     E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.4 Vognbaneskift og sammenfletning*\n7.11 Fremkørsel mod kryds*\n7.12 Ligeudkørsel i kryds*\n7.13 Højresving i kryds*\n7.14 Venstresving i kryds*\n7.15 Kørsel i rundkørsel*\n7.5 Vending og baglænskørsel\n7.9 Overhaling\n7.16 Kørsel på motorvej\n7.16.6 Kørsel på motortrafikvej\n7.17 Kørsel ved siden af andre\n7.18 Standsning og parkering\n7.19 Kørsel i mørke og i lygtetændingstiden i øvrigt\n7.20 Kørsel i tunnel\n7.21 Kørsel ved letbane\nAfsnit 8 – Særlige risikoforhold i trafikken\nAfsnit 10 (uddrag) – Regler og retningslinjer for kørekort\n10.1.2 Indstilling til køreprøve\n10.2 Køreprøvens gennemførelse\n10.3 Lovbestemmelser om kørekort',
     '* De praktiske øvelser i de markerede underafsnit skal gennemføres på mere udfordrende veje og i tæt trafik.'),
    (p_school_id, v_course, 5, 'Afsluttende teori- og kørselsmodul', 1, 9, 0,
     E'Afsnit 7 (uddrag) – Manøvrer på vej\n7.22 Afsluttende øvelseskørsel på vej\nAfsnit 9 – Manøvrer på køreteknisk anlæg*',
     '* Øvelserne på køreteknisk anlæg skal gennemføres i overensstemmelse med undervisningsplanens afsnitsopdeling.');

  return v_course;
end;
$$;
revoke all on function public.create_module_course(uuid, text, text) from public, anon;
grant execute on function public.create_module_course(uuid, text, text) to authenticated, service_role;
