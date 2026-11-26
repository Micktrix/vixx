-- Trin E9a: EU-lektionsplaner (aftalt med Michael 26. nov. 2026).
-- Fire faste EU-forløb pr. skole (EU Gods, EU Bus, EU Gods 3 uger, EU Bus 3 uger) med emner og faste timer fra skolens
-- blanketter (BEK 322/2020). Kontoret vælger ét af dem på eleven oven i kørekortforløbet (aldrig på holdet).
-- Læreren scanner eleven og bekræfter gennemførte emner og køretimer; lærerens gemte underskrift kopieres på og
-- kommer på den printede plan. Eleven skriver under med kuglepen på den printede plan (ingen elektronisk underskrift).

-- ---------------------------------------------------------------------------------------------------------------
-- 1. De fire EU-forløb erstatter det ene "EU"-forløb (som aldrig fik en plan).
alter table public.courses drop constraint courses_kind_check;
alter table public.courses disable trigger user;
delete from public.courses where kind = 'EU';
alter table public.courses enable trigger user;
alter table public.courses add constraint courses_kind_check
  check (kind in ('B', 'C', 'CE', 'D', 'TAXA', 'EU_GODS', 'EU_BUS', 'EU_GODS3', 'EU_BUS3'));

-- Emner og køretimer i et EU-forløb. "hours" er den faste "faktisk anvendt tid" fra blanketten (tom = udfyldes i
-- hånden); køretimer har antal lektioner á 45 min.
create table public.eu_topics (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  course_id uuid not null,
  kind text not null check (kind in ('topic', 'drive')),
  sort int not null,
  code text not null check (length(code) between 1 and 80),
  goal text check (length(goal) <= 500),
  description text check (length(description) <= 3000),
  hours numeric(5, 1) check (hours >= 0),
  lessons int check (lessons between 1 and 20),
  unique (course_id, kind, sort),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index eu_topics_school_idx on public.eu_topics (school_id);

alter table public.eu_topics enable row level security;
revoke all on public.eu_topics from anon, authenticated;
grant select on public.eu_topics to authenticated;
grant all on public.eu_topics to service_role;
create policy "Skolen ser EU-emnerne" on public.eu_topics
  for select to authenticated using (private.is_member(school_id));

-- Skolens blanketter (2026). Fælles tekster står én gang.
create function private.add_eu_course(p_school uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course uuid;
begin
  insert into public.courses (school_id, category_code, name, plan_kind, kind, active, locked)
  values (p_school,
          case when p_kind in ('EU_GODS', 'EU_GODS3') then 'C' else 'D' end,
          case p_kind when 'EU_GODS' then 'EU Gods' when 'EU_BUS' then 'EU Bus'
                      when 'EU_GODS3' then 'EU Gods 3 uger' else 'EU Bus 3 uger' end,
          'modules', p_kind, true, true)
  returning id into v_course;

  with t (k, goal, description) as (values
    ('11', 'at kende de karakteristiske egenskaber ved kraftoverføring for at kunne optimere brugen heraf',
     'Motorers drejningsmoment, effektkurver og brændstofforbrugskurver, optimalt køreområde på omdrejningstælleren samt diagrammer for gearenes overlapning.'),
    ('12', 'at kende sikkerhedsanordningernes karakteristiske egenskaber og funktioner med henblik på at beherske køretøjet, mindske slid og forebygge fejl',
     'Særlige kendetegn ved pneumatisk/hydraulisk bremsesystem, grænser for brug af bremser og retarder, kombineret brug af bremser og retarder, bedste valg af hastighed og gear, brug af køretøjets inerti, brug af forskellige metoder til at nedsætte hastigheden og til bremsning ved kørsel ned ad bakke samt reaktion ved funktionssvigt.'),
    ('13', 'at kunne optimere brændstofforbruget',
     'Optimering af brændstofforbruget ved anvendelse af, hvad der er lært under punkt 1.1 og 1.2.'),
    ('13a', 'Evne at forudse, vurdere og tilpasse sig risici i trafikken',
     'Deltageren kan tilpasse sig forskellige vej-, trafik- og vejrforhold, forudse kommende begivenheder, forstå hvordan man skal forberede og planlægge en tur under unormale vejrforhold. Deltageren har kendskab til brugen af sikkerhedsudstyr og forstår, når en tur må udsættes eller aflyses på grund af ekstreme vejrforhold. Deltageren kan tilpasse sig trafikrisici, herunder farlig adfærd i trafikken eller distraheret kørsel (gennem anvendelse af elektronisk udstyr, at spise, drikke, osv.). Deltageren kan endvidere anerkende og tilpasse sig farlige situationer og være i stand til at håndtere stress, der er afledt heraf, navnlig med hensyn til køretøjernes størrelse og vægt samt sårbare trafikanter såsom fodgængere, cyklister og tohjulede motoriserede køretøjer. Deltageren kan identificere mulige farlige situationer og korrekt fortolke, hvordan disse potentielt farlige situationer kan blive til situationer, hvor sammenstød ikke længere kan undgås, og vælge og foretage handlinger, der øger sikkerhedsmargenen i en sådan grad, at et sammenstød stadig kan undgås, hvis den potentielle farlige situation opstår.'),
    ('14', 'at kunne stå for lastning af et køretøj under overholdelse af sikkerhedsforskrifterne og den korrekte brug af køretøjet',
     E'Kræfter på køretøjet under kørsel, brug af forskellige gear alt efter køretøjets belæsningstilstand og vejens længdeprofil, beregning af køretøjets eller vogntogets nyttelast, beregning af lastrummets størrelse, placering af godset, følgerne af for stort akseltryk, køretøjets stabilitet og tyngdepunkt, emballagetyper og paller.\nHovedkategorier af gods, der kræver surring, sikrings- og surringsteknikker, brug af surringsremme, kontrol af surringsanordningerne, brug af udstyr til godshåndtering samt brug af presenning.'),
    ('15', 'at kunne varetage passagerernes sikkerhed og komfort',
     'Justering af langsgående og sidelæns bevægelser, fælles brug af vejnettet, placering på kørebanen, smidig opbremsning, overhæng, brug af særlige infrastrukturer (offentlige arealer, særlige kørebaner), løsning af konflikter mellem sikker kørsel og andre af chaufførens funktioner, kontakt med passagerer samt særlige aspekter ved befordring af visse typer passagerer (handicappede, børn).'),
    ('16', 'at kunne stå for lastning af et køretøj under overholdelse af sikkerhedsforskrifterne og den korrekte brug af køretøjet',
     'Kræfter på køretøjet under kørsel, brug af forskellige gear alt efter køretøjets belæsningstilstand og vejens længdeprofil, beregning af køretøjets eller vogntogets nyttelast, placering af godset, følgerne af for stort akseltryk, køretøjets stabilitet og tyngdepunkt.'),
    ('21', 'at kende vejtransportens sociale kontekst og reglerne',
     'Specifikke arbejdstidsregler for transport, forordning (EØF) nr. 3820/85 og (EØF) nr. 3821/85 og deres principper, anvendelse og konsekvenser, sanktioner for mangelfuld, ukorrekt eller svigagtig brug af fartskriver, kendskab til vejtransportens sociale kontekst: chaufførernes rettigheder og pligter med hensyn til grundlæggende kvalifikationer og efteruddannelse.'),
    ('22', 'at kende reglerne på godstransportområdet',
     'Transporttilladelser, forpligtelser i henhold til standardkontrakter for godstransport, udfærdigelse af dokumenter, der giver en kontrakt konkret form, internationale transporttilladelser, forpligtelser i henhold til CMR-konventionen, udfærdigelse af internationalt fragtbrev, krydsning af landegrænser, speditører samt særlige ledsagedokumenter til gods.'),
    ('23', 'at kende reglerne for passagerbefordring',
     'Transport af særlige grupper, sikkerhedsudstyr om bord på bussen, sikkerhedsseler og lastning af køretøjet.'),
    ('31', 'at være opmærksom på farer i trafikken og arbejdsulykker',
     'Arbejdsulykkestyper på transportområdet, statistikker for færdselsulykker, indblanding af store køretøjer samt menneskelige, materielle og økonomiske følger.'),
    ('32', 'at kunne forebygge kriminalitet og menneskesmugling',
     'Generel information, følger for chaufføren, forebyggende foranstaltninger, checkliste samt lovgivning om transportvirksomhedens ansvar.'),
    ('33', 'at kunne forebygge fysiske risici',
     'Ergonomi: farlige bevægelser og stillinger, fysisk kondition, øvelser i håndtering af gods samt personlige værnemidler.'),
    ('34', 'at være bevidst om betydningen af fysisk og psykisk egnethed',
     'Principperne om sunde og afbalancerede spisevaner, virkninger af alkohol, medicin og andre stoffer, der kan ændre adfærden, symptomer på træthed og stress og disses årsager og virkninger samt den grundlæggende betydning af skift mellem arbejde og hvile.'),
    ('35', 'at kunne vurdere nødsituationer',
     'Adfærd i nødsituationer: vurdere situationen, undgå forværring af en ulykke, tilkalde hjælp, hjælpe tilskadekomne og yde førstehjælp, reaktion ved brand, evakuering af personer i tunge erhvervskøretøjer og buspassagerer, sørge for alle passagerers sikkerhed, reaktion i tilfælde af aggression, grundprincipperne for udfyldelse af fælles skadeanmeldelse.'),
    ('36', 'at kunne tilpasse sin optræden på en måde, der bidrager til at højne en servicevirksomheds image',
     'Chaufførens optræden og image: betydningen for virksomheden af kvaliteten af den ydelse, chaufføren leverer, chaufførens forskellige roller, forskellige personer, som chaufføren kommer i kontakt med, vedligeholdelse af køretøjet, tilrettelæggelse af arbejdet, kommercielle og finansielle følger af tvister.'),
    ('37', 'at kende vejgodstransportens økonomiske kontekst og markedsorganisationen',
     'Vejtransport i forhold til andre transportmåder (konkurrence, speditører), forskellige vejtransportaktiviteter (transport for tredjemands regning, egen virksomhed, transportrelaterede aktiviteter), hovedtyper af transportvirksomheder og transportrelaterede aktiviteter og deres organisation, specialisering inden for transport (tank, kontrolleret temperatur mv.) samt sektorens udvikling (diversificering af ydelser, kombination af bane og vej, underentreprise mv.).'),
    ('38bus', 'at kende den økonomiske kontekst for personbefordring ad vej og markedsorganisationen',
     'Personbefordring ad vej i forhold til de forskellige personbefordringsmåder (tog, personbiler), forskellige aktiviteter inden for personbefordring ad vej, grænsepassage (international befordring) samt hovedtyper af virksomheder, der udfører personbefordring ad vej.'),
    ('39', 'Chaufføren skal have',
     E'- Kendskab til hvordan en kørestolsbruger hjælpes op af og ned i kørestolen\n- færdigheder i at assistere handicappede og bevægelseshæmmede, der rejser med en anerkendt hjælpehund, herunder sådanne hundes rolle og behov\n- teknikker til at ledsage synshæmmede passagerer og til håndtering og befordring af anerkendte hjælpehunde\n- kendskab til de typer hjælpemidler, som kan være til hjælp for handicappede og bevægelseshæmmede, og viden om, hvordan sådanne hjælpemidler håndteres\n- færdigheder i brugen af de benyttede hjælpemidler til på- og udstigning og viden om passende procedurer for assistance til på- og udstigning, der tilgodeser handicappedes og bevægelseshæmmedes sikkerhed og værdighed\n- forståelse for, at assistancen skal være pålidelig og professionel. Desuden opmærksomhed på, at nogle handicappede passagerer kan føle sig sårbare under rejser, fordi de er afhængige af, at der ydes assistance'),
    ('rep', 'Repetition',
     'Her registreres tid til repetition af ovenstående emner, typisk anvendt den sidste tid før kvalifikationsprøven.')
  ),
  p (course_kind, sort, code, k, hours) as (values
    ('EU_GODS', 1, '1.1', '11', 4), ('EU_GODS', 2, '1.2', '12', 12), ('EU_GODS', 3, '1.3', '13', 2),
    ('EU_GODS', 4, '1.3 a', '13a', 4), ('EU_GODS', 5, '1.4', '14', 16), ('EU_GODS', 6, '2.1', '21', 16),
    ('EU_GODS', 7, '2.2', '22', 12), ('EU_GODS', 8, '3.1', '31', 10), ('EU_GODS', 9, '3.2', '32', 6),
    ('EU_GODS', 10, '3.3', '33', 4), ('EU_GODS', 11, '3.4', '34', 4), ('EU_GODS', 12, '3.5', '35', 12),
    ('EU_GODS', 13, '3.6', '36', 8), ('EU_GODS', 14, '3.7', '37', 10), ('EU_GODS', 15, '3.8', 'rep', 18),
    ('EU_BUS', 1, '1.1', '11', 4), ('EU_BUS', 2, '1.2', '12', 10), ('EU_BUS', 3, '1.3', '13', 2),
    ('EU_BUS', 4, '1.3 a', '13a', 4), ('EU_BUS', 5, '1.5', '15', 4), ('EU_BUS', 6, '1.6', '16', 4),
    ('EU_BUS', 7, '2.1', '21', 18), ('EU_BUS', 8, '2.3', '23', 12), ('EU_BUS', 9, '3.1', '31', 10),
    ('EU_BUS', 10, '3.2', '32', 6), ('EU_BUS', 11, '3.3', '33', 4), ('EU_BUS', 12, '3.4', '34', 4),
    ('EU_BUS', 13, '3.5', '35', 14), ('EU_BUS', 14, '3.6', '36', 10), ('EU_BUS', 15, '3.8', '38bus', 6),
    ('EU_BUS', 16, '3.9', '39', 4), ('EU_BUS', 17, '3.10', 'rep', 18),
    ('EU_GODS3', 1, '1.4', '14', 16), ('EU_GODS3', 2, '2.2', '22', 12), ('EU_GODS3', 3, '3.7', '37', 10),
    ('EU_GODS3', 4, '3.8', 'rep', null),
    ('EU_BUS3', 1, '1.5', '15', null), ('EU_BUS3', 2, '1.6', '16', null), ('EU_BUS3', 3, '2.3', '23', null),
    ('EU_BUS3', 4, '3.8', '38bus', null), ('EU_BUS3', 5, '3.9', '39', null), ('EU_BUS3', 6, '3.10', 'rep', null)
  )
  insert into public.eu_topics (school_id, course_id, kind, sort, code, goal, description, hours)
  select p_school, v_course, 'topic', p.sort, p.code, t.goal, t.description, p.hours
  from p join t on t.k = p.k
  where p.course_kind = p_kind;

  insert into public.eu_topics (school_id, course_id, kind, sort, code, lessons)
  select p_school, v_course, 'drive', d.sort, d.code, d.lessons
  from (values
    ('EU_GODS', 1, 'Energirigtig kørsel', 2), ('EU_GODS', 2, 'Anden by', 2), ('EU_GODS', 3, 'EU tur', 4),
    ('EU_GODS', 4, 'Veksellad', 2),
    ('EU_BUS', 1, 'Energirigtig kørsel (ØKO)', 2), ('EU_BUS', 2, 'Anden by', 2), ('EU_BUS', 3, 'EU tur', 4),
    ('EU_BUS', 4, '3 akslet', 2),
    ('EU_GODS3', 1, 'Energirigtig kørsel (ØKO)', 1), ('EU_GODS3', 2, 'Veksellad', 2)
  ) d (course_kind, sort, code, lessons)
  where d.course_kind = p_kind;
  return v_course;
end;
$$;

-- Skolens faste forløb: B, C, C/E, D fra styrelsens plan 1.1, Taxa uden plan, og de fire EU-forløb.
create or replace function private.add_fixed_courses(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_course uuid;
  v_eu text;
begin
  for r in
    select * from (values ('B', 'B-1.1', 'B', true), ('C', 'C-1.1', 'C', false), ('CE', 'CE-1.1', 'C/E', false), ('D', 'D-1.1', 'D', false))
      t (kind, template, name, theory)
  loop
    if not exists (select 1 from public.courses c where c.school_id = p_school and c.kind = r.kind) then
      v_course := public.create_module_course(p_school, r.template, r.name);
      update public.courses set kind = r.kind, theory_at_scan = r.theory, locked = true where id = v_course;
    end if;
  end loop;
  insert into public.courses (school_id, category_code, name, plan_kind, kind, active)
  select p_school, 'B', 'Taxa', 'modules', 'TAXA', false
  where not exists (select 1 from public.courses c where c.school_id = p_school and c.kind = 'TAXA');
  foreach v_eu in array array['EU_GODS', 'EU_BUS', 'EU_GODS3', 'EU_BUS3'] loop
    if not exists (select 1 from public.courses c where c.school_id = p_school and c.kind = v_eu) then
      perform private.add_eu_course(p_school, v_eu);
    end if;
  end loop;
end;
$$;
select private.add_fixed_courses(id) from public.schools;

-- Et EU-forløb er aldrig elevens eller holdets kørekortforløb.
create or replace function private.check_student_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.courses c where c.id = new.course_id and c.kind like 'EU%') then
    raise exception 'EU vælges som "EU-forløb" på eleven.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. EU-forløbet på eleven (erstatter fluebenet `eu`, som bliver stående uden brug).
alter table public.students add column eu_course_id uuid;
alter table public.students
  add constraint students_eu_course_fk foreign key (school_id, eu_course_id) references public.courses (school_id, id);
create index students_eu_course_idx on public.students (eu_course_id);

create function private.check_student_eu_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.eu_course_id is not null
     and not exists (select 1 from public.courses c where c.id = new.eu_course_id and c.kind like 'EU%') then
    raise exception 'Vælg et EU-forløb.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger check_student_eu_course before insert or update of eu_course_id on public.students
  for each row execute function private.check_student_eu_course();

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Lærerens bekræftelser: emner (én gang pr. emne) og køretimer. Kopi af lærerens gemte underskrift (`strokes`,
--    kan ikke læses via API'et). Rettes og slettes ikke; admin kan slette en fejl (logges).
create table public.eu_signoffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  eu_topic_id uuid references public.eu_topics (id) on delete restrict,
  kind text not null check (kind in ('topic', 'drive')),
  drive_title text check (length(drive_title) between 1 and 80),
  lessons int check (lessons between 1 and 20),
  signed_on date not null default private.today_dk(),
  instructor_id uuid not null,
  instructor_name text not null default '',
  strokes text check (strokes ~ '^[ML0-9 .-]+$'),
  signed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((kind = 'topic' and eu_topic_id is not null) or (kind = 'drive' and lessons is not null and (eu_topic_id is not null or drive_title is not null))),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create unique index eu_signoffs_one_topic on public.eu_signoffs (student_id, eu_topic_id) where kind = 'topic';
create index eu_signoffs_student_idx on public.eu_signoffs (student_id);
create index eu_signoffs_school_idx on public.eu_signoffs (school_id);

alter table public.eu_signoffs enable row level security;
revoke all on public.eu_signoffs from anon, authenticated;
grant select (id, school_id, student_id, eu_topic_id, kind, drive_title, lessons, signed_on, instructor_id, instructor_name,
              signed_by, created_at) on public.eu_signoffs to authenticated;
grant delete on public.eu_signoffs to authenticated;
grant all on public.eu_signoffs to service_role;
create policy "Skolen ser EU-bekræftelserne" on public.eu_signoffs
  for select to authenticated using (private.is_member(school_id));
create policy "Admin sletter en fejlagtig EU-bekræftelse" on public.eu_signoffs
  for delete to authenticated using (private.is_admin(school_id));
create trigger write_audit after insert or delete on public.eu_signoffs
  for each row execute function private.write_audit();

-- Emnet skal høre til elevens EU-forløb; lærerens navn og underskrift sættes på.
create function private.guard_eu_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course uuid;
begin
  select s.eu_course_id into v_course from public.students s where s.id = new.student_id and s.school_id = new.school_id and s.active;
  if v_course is null then
    raise exception 'Eleven har intet EU-forløb.' using errcode = 'check_violation';
  end if;
  if new.eu_topic_id is not null and not exists (
    select 1 from public.eu_topics t where t.id = new.eu_topic_id and t.course_id = v_course and t.kind = new.kind
  ) then
    raise exception 'Emnet hører ikke til elevens EU-forløb.' using errcode = 'check_violation';
  end if;
  if new.kind = 'drive' and new.eu_topic_id is not null then
    new.drive_title := null;
  end if;
  new.drive_title := nullif(btrim(new.drive_title), '');
  new.instructor_name := coalesce((select p.full_name from public.instructors i join public.profiles p on p.id = i.user_id
                                   where i.id = new.instructor_id), '');
  new.strokes := private.instructor_signature(new.instructor_id);
  if new.strokes is null and current_user = 'authenticated' then
    raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du bekræfter EU.' using errcode = 'check_violation';
  end if;
  if current_user = 'authenticated' then
    new.signed_on := private.today_dk();
    new.signed_by := (select auth.uid());
  end if;
  return new;
end;
$$;
create trigger guard_eu_signoff before insert on public.eu_signoffs
  for each row execute function private.guard_eu_signoff();

-- Lærerens scanning: bekræft emner og evt. én køretime i ét tryk (alt eller intet). Læreren er den indloggede.
create function public.record_eu_scan(p_student uuid, p_topics uuid[], p_drive uuid, p_drive_title text, p_drive_lessons int)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_school uuid;
  v_instructor uuid;
  v_topic uuid;
begin
  select s.school_id into v_school from public.students s where s.id = p_student;
  select i.id into v_instructor from public.instructors i where i.school_id = v_school and i.user_id = (select auth.uid());
  if v_school is null or v_instructor is null then
    raise exception 'Du har ikke adgang til at kvittere for denne elev.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(p_topics, 1), 0) = 0 and p_drive is null and nullif(btrim(p_drive_title), '') is null then
    raise exception 'Vælg mindst ét emne eller en køretime.' using errcode = 'check_violation';
  end if;
  foreach v_topic in array coalesce(p_topics, '{}') loop
    insert into public.eu_signoffs (school_id, student_id, eu_topic_id, kind, instructor_id)
    values (v_school, p_student, v_topic, 'topic', v_instructor);
  end loop;
  if p_drive is not null or nullif(btrim(p_drive_title), '') is not null then
    insert into public.eu_signoffs (school_id, student_id, eu_topic_id, kind, drive_title, lessons, instructor_id)
    values (v_school, p_student, p_drive, 'drive', p_drive_title,
            coalesce(p_drive_lessons, (select t.lessons from public.eu_topics t where t.id = p_drive)), v_instructor);
  end if;
end;
$$;
-- Indsættelse sker kun via record_eu_scan (kører som den, der kalder, med INSERT-ret her).
grant insert on public.eu_signoffs to authenticated;
create policy "Læreren bekræfter EU for skolens elever" on public.eu_signoffs
  for insert to authenticated with check (private.is_staff(school_id) and instructor_id in (select private.my_instructor_ids()));

revoke all on function public.record_eu_scan(uuid, uuid[], uuid, text, int) from public, anon;
grant execute on function public.record_eu_scan(uuid, uuid[], uuid, text, int) to authenticated, service_role;
revoke all on function private.add_eu_course(uuid, text), private.check_student_eu_course(), private.guard_eu_signoff()
  from public, anon;
grant execute on function private.add_eu_course(uuid, text), private.check_student_eu_course(), private.guard_eu_signoff()
  to authenticated, service_role;
