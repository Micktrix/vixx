-- Trin E10 (aftalt med Michael 26. nov. 2026): skolens lektionsplan ved scanning for C, D og C/E (samme skema; B
-- uændret). Læreren vælger lektionen; Vixx fordeler lektionens 45-minutters-enheder på modulerne, tæller dem i
-- modulplanen og afslutter modulet, når den sidste manglende lektion køres (den kørende lærer underskriver).
-- Mørke flyttes fra modul 2 til modul 3 på C og D (skolens valg). Lektionsplanen printes med hver lektions dato og
-- den kørende lærers underskrift.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Lektionerne pr. forløb. `units` = modulnummer for hver 45-minutters-enhed (fx {1,2}: én i modul 1, én i modul 2).
--    `codes` = de køreemner i modulplanen, lektionen dækker (bruges til modulernes køreemner og KTA-kravet).
create table public.school_lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  course_id uuid not null,
  number int not null check (number between 1 and 99),
  title text not null check (length(title) between 1 and 60),
  paper_no text check (length(paper_no) <= 20),
  kind text not null default 'normal' check (kind in ('normal', 'dark', 'kta')),
  units int[] not null check (cardinality(units) between 1 and 8),
  items text not null default '' check (length(items) <= 3000),
  codes text[] not null default '{}',
  control text check (length(control) <= 200),
  note text check (length(note) <= 300),
  unique (course_id, number),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index school_lessons_school_idx on public.school_lessons (school_id);
alter table public.school_lessons enable row level security;
revoke all on public.school_lessons from anon, authenticated;
grant select on public.school_lessons to authenticated;
grant all on public.school_lessons to service_role;
create policy "Skolen ser lektionerne" on public.school_lessons
  for select to authenticated using (private.is_member(school_id) or private.is_student(school_id));

create function private.add_school_lessons(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  select school_id into v_school from public.courses where id = p_course;
  if exists (select 1 from public.school_lessons where course_id = p_course) then
    return;
  end if;
  insert into public.school_lessons (school_id, course_id, number, title, paper_no, kind, units, items, codes, control, note)
  select v_school, p_course, l.number, l.title, l.paper_no, l.kind, l.units, l.items, l.codes, l.control, l.note
  from (values
    (1, 'Lektion 1', '2', 'normal', array[1, 1],
     E'(Øvelsesplads/fabriksområde el. lign.)\n2.1 Forberedelse til kørsel\n2.2 Lastbilens spejle\n2.3 Igangsætning og standsning ved kørebanekant\n2.4 Forlæns og baglæns højresving om hjørner\n2.5 Baglæns kørsel med målbremsning',
     array['Afsnit 2'], 'Bremser og styretøj', null),
    (2, 'Lektion 2', '4', 'normal', array[1, 1],
     E'1.1–1.6 Stikprøvevis kontrol mv. af køretøjets udstyr\n7.1 Igangsætning og standsning v. kantsten\n7.2 Placering under ligeudkørsel\n7.3 Hastighed under ligeudkørsel\n7.4 Vognbaneskift og sammenfletning\n7.5 Vending og baglænskørsel\n7.13 Højresving i mindre trafikerede kryds\n7.14 Venstresving i mindre trafikerede kryds\n7.15 Kørsel i rundkørsel\nSamt repetition fra kategori B:\n7.6 Kørsel forbi holdende\n7.7 Møde\n7.8 Kørsel foran eller efter andre\n7.11 Fremkørsel mod kryds\n7.12 Ligeudkørsel i kryds',
     array['7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.11', '7.12', '7.13', '7.14', '7.15'], 'Lygter og bærende dele', null),
    (3, 'Lektion 3', '6', 'normal', array[1, 2],
     E'1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr\n7.2 Placering under ligeudkørsel\n7.3 Hastighed under ligeudkørsel\n7.6 Kørsel forbi holdende køretøjer, gående mv.\n7.7 Møde\n7.8 Kørsel foran eller efter andre\n7.9 Overhaling\nSamt repetition fra lektion 2',
     array['7.2', '7.3', '7.6', '7.7', '7.8', '7.9'], 'Motor og karosseri', null),
    (4, 'Lektion 4', '9', 'normal', array[2, 2],
     E'1.1–1.7 Stikprøvevis kontrol af køretøjets udstyr\n7.3 Landevejskørsel\n7.9 Overhaling\n7.15 Kørsel i (større) rundkørsler\n7.16 Kørsel på motorvej/(motortrafikvej)\n7.20 Kørsel i tunnel\n7.21 Kørsel ved letbane',
     array['7.3', '7.9', '7.15', '7.16', '7.20', '7.21'], 'Vægttavler gennemgås', null),
    (5, 'Lektion 5', '11', 'normal', array[2, 2],
     E'Stikprøvevis kontrol mv. af køretøjets udstyr\n7.17 Kørsel ved siden af andre (tæt trafik)\nRepetition af:\n7.11 Fremkørsel mod kryds\n7.12 Ligeudkørsel i kryds\n7.13 Højresving i kryds\n7.14 Venstresving i kryds\n7.15 Kørsel i rundkørsel (mindre)\n7.18 Standsning og parkering',
     array['7.11', '7.12', '7.13', '7.14', '7.15', '7.17', '7.18'], 'Repetition af kontrolstof', null),
    (6, 'Lektion 6', '12', 'dark', array[3],
     E'1.1–1.7 Stikprøvevis kontrol\n7.19 Kørsel i mørke',
     array['7.19'], null, null),
    (7, 'Lektion 7', '13', 'normal', array[3],
     E'1.1–1.5 Stikprøvevis kontrol m.v. af køretøjets udstyr\n7.1–7.18 Repetition af foregående manøvrer',
     array['Afsnit 7'], null, null),
    (8, 'Lektion 8', '17', 'normal', array[3],
     E'(Fri øvelsesstrækning)\nEvaluerende praktisk prøve\nRepetition og forberedelse til praktisk prøve\nRepetition og foregående manøvrer 7.2–7.18\n1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr',
     array['Afsnit 7'], null, 'Lektion 8 og 9 kan køres samlet (2 × 45 min.).'),
    (9, 'Lektion 9', '18', 'normal', array[3],
     E'(Fri øvelsesstrækning)\nSidste kørsel inden aflæggelse af praktisk prøve, herunder stikprøvevis kontrol af køretøjets udstyr\nRepetition og foregående manøvrer 7.2–7.18',
     array['Afsnit 7'], 'Repetition af kontrolstof', 'Lektion 8 og 9 kan køres samlet (2 × 45 min.).'),
    (10, 'KTA', null, 'kta', array[3, 3, 3, 3],
     'Afsnit 9 – Manøvrer på køreteknisk anlæg',
     array['Afsnit 9'], null, 'Må køres når som helst i modul 3.')
  ) l (number, title, paper_no, kind, units, items, codes, control, note);
end;
$$;

-- C, D og C/E får lektionsplanen (også nye skoler).
select private.add_school_lessons(c.id) from public.courses c where c.kind in ('C', 'D', 'CE');

create or replace function private.add_school_fixed_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_fixed_courses(new.id);
  perform private.add_school_lessons(c.id) from public.courses c where c.school_id = new.id and c.kind in ('C', 'D', 'CE');
  perform private.move_dark_to_module3(new.id);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Mørke flyttes fra modul 2 til modul 3 på C og D (skolens valg 26. nov. 2026). Også for nye skoler.
create function private.move_dark_to_module3(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.course_modules m set
    min_dark = 0,
    topics = regexp_replace(m.topics, E'\n?7\.19 [^\n]*', '')
  from public.courses c
  where c.id = m.course_id and c.school_id = p_school and c.kind in ('C', 'D') and m.number = 2 and m.min_dark > 0;
  update public.course_modules m set
    min_dark = 1,
    topics = m.topics || E'
7.19 Kørsel i mørke og i lygtetændingstiden i øvrigt'
  from public.courses c
  where c.id = m.course_id and c.school_id = p_school and c.kind in ('C', 'D') and m.number = 3 and m.min_dark = 0;
end;
$$;
select private.move_dark_to_module3(id) from public.schools;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Kørte lektioner: én pr. elev og lektion, med dato, lærer og en kopi af lærerens underskrift (`strokes`, kan ikke
--    læses via API'et) til lektionsplanen. `skipped` = punkter, der ikke blev gennemført.
create table public.lesson_signoffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  school_lesson_id uuid not null references public.school_lessons (id) on delete restrict,
  lesson_date date not null default private.today_dk(),
  instructor_id uuid not null,
  instructor_name text not null default '',
  strokes text check (strokes ~ '^[ML0-9 .-]+$'),
  skipped text check (length(skipped) <= 3000),
  signed_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, school_lesson_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create index lesson_signoffs_school_idx on public.lesson_signoffs (school_id);
alter table public.lesson_signoffs enable row level security;
revoke all on public.lesson_signoffs from anon, authenticated;
grant select (id, school_id, student_id, school_lesson_id, lesson_date, instructor_id, instructor_name, skipped, signed_by, created_at)
  on public.lesson_signoffs to authenticated;
grant insert, delete on public.lesson_signoffs to authenticated;
grant all on public.lesson_signoffs to service_role;
create policy "Skolen ser kørte lektioner, eleven sine egne" on public.lesson_signoffs
  for select to authenticated using (
    private.is_member(school_id)
    or student_id in (select s.id from public.students s where s.user_id = (select auth.uid()) and s.active)
  );
create policy "Læreren registrerer kørte lektioner" on public.lesson_signoffs
  for insert to authenticated with check (private.is_staff(school_id) and instructor_id in (select private.my_instructor_ids()));
create policy "Admin sletter en fejlagtig lektion" on public.lesson_signoffs
  for delete to authenticated using (private.is_admin(school_id));
create trigger write_audit after insert or delete on public.lesson_signoffs
  for each row execute function private.write_audit();

alter table public.module_signoffs
  add column lesson_signoff_id uuid references public.lesson_signoffs (id) on delete cascade;
create index module_signoffs_lesson_idx on public.module_signoffs (lesson_signoff_id);
grant select (lesson_signoff_id) on public.module_signoffs to authenticated;

create function private.guard_lesson_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.instructor_name := coalesce((select p.full_name from public.instructors i join public.profiles p on p.id = i.user_id
                                   where i.id = new.instructor_id), '');
  new.strokes := private.instructor_signature(new.instructor_id);
  if new.strokes is null and current_user = 'authenticated' then
    raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du bekræfter lektioner.' using errcode = 'check_violation';
  end if;
  if current_user = 'authenticated' then
    new.lesson_date := private.today_dk();
    new.signed_by := (select auth.uid());
  end if;
  new.skipped := nullif(btrim(new.skipped), '');
  return new;
end;
$$;
create trigger guard_lesson_signoff before insert on public.lesson_signoffs
  for each row execute function private.guard_lesson_signoff();

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Lærerens scanning af lektioner: hver valgt lektion registreres, dens enheder tælles i modulerne (med de
--    køreemner, lektionen dækker), og de moduler, læreren har erklæret, afsluttes (databasen tjekker minimum,
--    mørke, KTA og rækkefølge). Alt eller intet. `p_skipped` = punkter, der ikke blev gennemført (én pr. linje).
create function public.record_lesson_scan(
  p_student uuid,
  p_lessons uuid[],
  p_skipped text,
  p_dark boolean,
  p_kta boolean,
  p_complete int[],
  p_theory int[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_school uuid;
  v_course uuid;
  v_instructor uuid;
  v_lesson public.school_lessons;
  v_signoff uuid;
  v_module public.course_modules;
  v_count int;
  v_skipped_codes text[];
  v_codes text[];
  v_topics_skipped text;
  i int;
begin
  select s.school_id, s.course_id into v_school, v_course from public.students s where s.id = p_student and s.active;
  select ins.id into v_instructor from public.instructors ins where ins.school_id = v_school and ins.user_id = (select auth.uid());
  if v_school is null or v_instructor is null then
    raise exception 'Du har ikke adgang til at kvittere for denne elev.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_lessons), 0) = 0 then
    raise exception 'Vælg lektionen.' using errcode = 'check_violation';
  end if;
  -- Koderne på de punkter, der ikke blev gennemført (fx "7.9").
  select coalesce(array_agg(substring(btrim(l) from '^(\d+\.\d+|Afsnit \d+)')) filter (where btrim(l) ~ '^(\d+\.\d+|Afsnit \d+)'), '{}')
    into v_skipped_codes
  from regexp_split_to_table(coalesce(p_skipped, ''), E'\n') l;

  foreach v_signoff in array p_lessons loop
    select * into v_lesson from public.school_lessons where id = v_signoff and course_id = v_course;
    if v_lesson.id is null then
      raise exception 'Lektionen hører ikke til elevens forløb.' using errcode = 'check_violation';
    end if;
    if v_lesson.kind = 'dark' and not coalesce(p_dark, false) then
      raise exception 'Bekræft, at der er kørt i mørke.' using errcode = 'check_violation';
    end if;
    if v_lesson.kind = 'kta' and not coalesce(p_kta, false) then
      raise exception 'Bekræft, at eleven har kørt på køreteknisk anlæg.' using errcode = 'check_violation';
    end if;
    insert into public.lesson_signoffs (school_id, student_id, school_lesson_id, instructor_id, skipped)
    values (v_school, p_student, v_lesson.id, v_instructor,
            (select string_agg(btrim(l), E'\n') from regexp_split_to_table(coalesce(p_skipped, ''), E'\n') l
             where btrim(l) <> '' and position(btrim(l) in v_lesson.items) > 0))
    returning id into v_signoff;
    v_codes := array(select c from unnest(v_lesson.codes) c where not c = any (v_skipped_codes));

    -- Enhederne pr. modul tælles i modulplanen. Køreemner, lektionen ikke dækker, står som ikke kørt.
    for v_module in
      select m.* from public.course_modules m
      where m.course_id = v_course and m.number = any (v_lesson.units)
      order by m.number
    loop
      select count(*) into v_count from unnest(v_lesson.units) u where u = v_module.number;
      select string_agg(btrim(t), E'\n') into v_topics_skipped
      from regexp_split_to_table(coalesce(v_module.topics, ''), E'\n') t
      where btrim(t) ~ '^([279]\.\d|Afsnit [279] [–-])'
        and coalesce(substring(btrim(t) from '^(\d+\.\d+|Afsnit \d+)'), '') <> all (v_codes);
      insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, manual_gear,
                                          instructor_id, skipped_items, lesson_signoff_id)
      values (v_school, p_student, v_module.id, 'driving', v_count, v_lesson.kind = 'dark' and v_module.min_dark > 0, false,
              v_instructor, v_topics_skipped, v_signoff);
    end loop;
  end loop;

  -- Afslut de moduler, læreren har erklæret (i rækkefølge).
  for i in 1 .. coalesce(cardinality(p_complete), 0) loop
    select m.* into v_module from public.course_modules m where m.course_id = v_course and m.number = p_complete[i];
    insert into public.module_completions (school_id, student_id, course_module_id, module_number, instructor_id, declaration,
                                           transferred, theory_lessons)
    values (v_school, p_student, v_module.id, 0, v_instructor, true, false, p_theory[i]);
  end loop;
end;
$$;
revoke all on function public.record_lesson_scan(uuid, uuid[], text, boolean, boolean, int[], int[]) from public, anon;
grant execute on function public.record_lesson_scan(uuid, uuid[], text, boolean, boolean, int[], int[]) to authenticated, service_role;
revoke all on function private.add_school_lessons(uuid), private.guard_lesson_signoff(), private.move_dark_to_module3(uuid) from public, anon;
grant execute on function private.add_school_lessons(uuid), private.guard_lesson_signoff() to authenticated, service_role;
grant execute on function private.move_dark_to_module3(uuid) to service_role;
