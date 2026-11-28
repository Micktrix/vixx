-- Elevens underskrift og bekræftelse i appen (Michael 28. nov. 2026). Skolen har fået bekræftet, at underskriften må
-- være digital. Eleven skriver under én gang (gemt og låst som lærernes) og bekræfter derefter hver scanning i appen:
-- en kørt lektion i lektionsplanen (C/D/C-E), en EU-bekræftelse (emne eller køretime) eller en scanning i modulerne (B).
-- "Bekræft" gemmer tidspunkt og en kopi af elevens underskrift på netop den scanning; "Det passer ikke" giver læreren,
-- der scannede, besked. Læreren kan sagtens køre næste lektion/modul, selv om eleven ikke har bekræftet endnu.
-- Elevens underskrift kommer på lektionsplanen og EU-planen (ikke Færdselsstyrelsens modulplan, som ikke har feltet).

-- 1. Elevens underskrift. Kun eleven selv (via funktionerne) og serveren (udskrifterne) kan læse den.
create table public.student_signatures (
  student_id uuid primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  strokes text not null check (strokes ~ '^[ML0-9 .-]+$' and length(strokes) <= 60000),
  updated_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create index student_signatures_school_idx on public.student_signatures (school_id);
alter table public.student_signatures enable row level security;
revoke all on public.student_signatures from anon, authenticated;
grant all on public.student_signatures to service_role;

-- 2. Elevens svar på en scanning: bekræftet (med kopi af underskriften) eller "det passer ikke" (med note).
create table public.student_confirmations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  lesson_signoff_id uuid unique references public.lesson_signoffs (id) on delete cascade,
  eu_signoff_id uuid unique references public.eu_signoffs (id) on delete cascade,
  module_signoff_id uuid unique references public.module_signoffs (id) on delete cascade,
  status text not null check (status in ('confirmed', 'disputed')),
  note text check (length(note) <= 500),
  strokes text check (strokes ~ '^[ML0-9 .-]+$'),
  created_at timestamptz not null default now(),
  check (num_nonnulls(lesson_signoff_id, eu_signoff_id, module_signoff_id) = 1),
  check (status = 'disputed' or strokes is not null),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create index student_confirmations_school_idx on public.student_confirmations (school_id);
create index student_confirmations_student_idx on public.student_confirmations (student_id);
alter table public.student_confirmations enable row level security;
revoke all on public.student_confirmations from anon, authenticated;
-- Underskriften (strokes) kan ikke læses via API'et; udskrifterne henter den på serveren.
grant select (id, school_id, student_id, lesson_signoff_id, eu_signoff_id, module_signoff_id, status, note, created_at)
  on public.student_confirmations to authenticated;
grant all on public.student_confirmations to service_role;
create policy "Skolen ser elevernes bekræftelser, eleven sine egne" on public.student_confirmations
  for select to authenticated using (
    private.is_member(school_id)
    or student_id in (select s.id from public.students s where s.user_id = (select auth.uid()) and s.active)
  );
create trigger write_audit after insert on public.student_confirmations
  for each row execute function private.write_audit();

-- 3. Elevens egen underskrift: gem (og lås) og læs.
create function public.student_save_signature(p_school uuid, p_strokes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student(p_school);
begin
  if v_student is null then
    raise exception 'Kun eleven selv kan gemme sin underskrift.' using errcode = 'insufficient_privilege';
  end if;
  if p_strokes is null or p_strokes !~ '^[ML0-9 .-]+$' or length(p_strokes) > 60000 or length(p_strokes) < 20 then
    raise exception 'Skriv under i feltet, før du gemmer.' using errcode = 'check_violation';
  end if;
  insert into public.student_signatures (student_id, school_id, strokes)
  values (v_student, p_school, p_strokes)
  on conflict (student_id) do update set strokes = excluded.strokes, updated_at = now();
end;
$$;

create function public.student_my_signature(p_school uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.strokes from public.student_signatures g where g.student_id = private.my_student(p_school);
$$;

-- 4. Det, eleven mangler at svare på: scanninger uden bekræftelse. Kørte lektioner i lektionsplanen, EU-emner og
--    -køretimer og scanninger i modulerne (ikke dem, der kommer fra en lektion i lektionsplanen).
create function public.student_to_confirm(p_school uuid)
returns table (kind text, id uuid, title text, lesson_date date, instructor_name text, lessons int)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select private.my_student(p_school) as id)
  select 'lesson', l.id, sl.title || case sl.kind when 'dark' then ' (mørke)' when 'kta' then ' (køreteknisk anlæg)' else '' end,
         l.lesson_date, l.instructor_name, coalesce(array_length(sl.units, 1), 1)
  from public.lesson_signoffs l
  join public.school_lessons sl on sl.id = l.school_lesson_id
  cross join me
  where l.student_id = me.id
    and not exists (select 1 from public.student_confirmations c where c.lesson_signoff_id = l.id)
  union all
  select 'eu', e.id,
         case when e.kind = 'topic' then 'EU emne ' || t.code else 'EU køretime: ' || coalesce(t.code, e.drive_title) end,
         e.signed_on, e.instructor_name, e.lessons
  from public.eu_signoffs e
  left join public.eu_topics t on t.id = e.eu_topic_id
  cross join me
  where e.student_id = me.id
    and not exists (select 1 from public.student_confirmations c where c.eu_signoff_id = e.id)
  union all
  select 'module', m.id,
         'Modul ' || cm.number || ': ' || case m.kind when 'theory' then 'teori' else 'kørsel' end || case when m.dark then ' (mørke)' else '' end,
         m.lesson_date, m.instructor_name, m.lesson_count
  from public.module_signoffs m
  join public.course_modules cm on cm.id = m.course_module_id
  cross join me
  where m.student_id = me.id and m.lesson_signoff_id is null and m.instructor_id is not null
    and not exists (select 1 from public.student_confirmations c where c.module_signoff_id = m.id)
  order by 4, 3;
$$;

-- 5. Bekræft: en kopi af elevens underskrift sættes på hver valgt scanning. Kun elevens egne; allerede besvarede
--    springes over. Returnerer antallet, der blev bekræftet.
create function public.student_confirm(p_school uuid, p_lessons uuid[], p_eu uuid[], p_modules uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student(p_school);
  v_strokes text;
  v_count int := 0;
  v_n int;
begin
  if v_student is null then
    raise exception 'Kun eleven selv kan bekræfte.' using errcode = 'insufficient_privilege';
  end if;
  select g.strokes into v_strokes from public.student_signatures g where g.student_id = v_student;
  if v_strokes is null then
    raise exception 'Skriv under under "Min underskrift", før du bekræfter.' using errcode = 'check_violation';
  end if;

  insert into public.student_confirmations (school_id, student_id, lesson_signoff_id, status, strokes)
  select p_school, v_student, l.id, 'confirmed', v_strokes
  from public.lesson_signoffs l
  where l.id = any (coalesce(p_lessons, '{}')) and l.student_id = v_student
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  insert into public.student_confirmations (school_id, student_id, eu_signoff_id, status, strokes)
  select p_school, v_student, e.id, 'confirmed', v_strokes
  from public.eu_signoffs e
  where e.id = any (coalesce(p_eu, '{}')) and e.student_id = v_student
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  insert into public.student_confirmations (school_id, student_id, module_signoff_id, status, strokes)
  select p_school, v_student, m.id, 'confirmed', v_strokes
  from public.module_signoffs m
  where m.id = any (coalesce(p_modules, '{}')) and m.student_id = v_student
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_count + v_n;
end;
$$;

-- 6. "Det passer ikke": gemmes uden underskrift, og læreren, der scannede, får besked i Beskeder.
create function public.student_dispute(p_school uuid, p_kind text, p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student(p_school);
  v_instructor uuid;
  v_what text;
  v_date date;
  v_name text;
begin
  if v_student is null then
    raise exception 'Kun eleven selv kan svare.' using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'lesson' then
    select l.instructor_id, sl.title, l.lesson_date into v_instructor, v_what, v_date
    from public.lesson_signoffs l join public.school_lessons sl on sl.id = l.school_lesson_id
    where l.id = p_id and l.student_id = v_student;
  elsif p_kind = 'eu' then
    select e.instructor_id, coalesce(t.code, e.drive_title), e.signed_on into v_instructor, v_what, v_date
    from public.eu_signoffs e left join public.eu_topics t on t.id = e.eu_topic_id
    where e.id = p_id and e.student_id = v_student;
    v_what := 'EU ' || v_what;
  elsif p_kind = 'module' then
    select m.instructor_id, 'modul ' || cm.number, m.lesson_date into v_instructor, v_what, v_date
    from public.module_signoffs m join public.course_modules cm on cm.id = m.course_module_id
    where m.id = p_id and m.student_id = v_student;
  end if;
  if v_what is null then
    raise exception 'Scanningen findes ikke.' using errcode = 'check_violation';
  end if;

  insert into public.student_confirmations (school_id, student_id, lesson_signoff_id, eu_signoff_id, module_signoff_id, status, note)
  values (p_school, v_student,
          case when p_kind = 'lesson' then p_id end, case when p_kind = 'eu' then p_id end, case when p_kind = 'module' then p_id end,
          'disputed', nullif(btrim(left(coalesce(p_note, ''), 500)), ''));

  select p.full_name into v_name from public.students s join public.profiles p on p.id = s.user_id where s.id = v_student;
  if v_instructor is not null then
    insert into public.messages (school_id, recipient_instructor_id, kind, body, sent_by)
    values (p_school, v_instructor, 'notification',
            coalesce(v_name, 'Eleven') || ' mener ikke, at ' || v_what || ' den ' || to_char(v_date, 'DD.MM.YYYY') || ' passer'
            || coalesce(': "' || nullif(btrim(p_note), '') || '"', '.') || ' Tal med eleven, og kontakt kontoret, hvis noget skal rettes.',
            (select auth.uid()));
  end if;
end;
$$;

revoke all on function public.student_save_signature(uuid, text) from public, anon;
revoke all on function public.student_my_signature(uuid) from public, anon;
revoke all on function public.student_to_confirm(uuid) from public, anon;
revoke all on function public.student_confirm(uuid, uuid[], uuid[], uuid[]) from public, anon;
revoke all on function public.student_dispute(uuid, text, uuid, text) from public, anon;
grant execute on function public.student_save_signature(uuid, text) to authenticated;
grant execute on function public.student_my_signature(uuid) to authenticated;
grant execute on function public.student_to_confirm(uuid) to authenticated;
grant execute on function public.student_confirm(uuid, uuid[], uuid[], uuid[]) to authenticated;
grant execute on function public.student_dispute(uuid, text, uuid, text) to authenticated;
