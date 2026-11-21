-- Ombygning af forløb og scanning (aftalt med Michael 20. nov. 2026): kun Færdselsstyrelsens modulplan, enkelt.
-- 1. Faste forløb pr. skole: B, C, C/E, D (styrelsens plan 1.1), EU og Taxa, oprettet automatisk. Intet "Nyt
--    forløb", ingen navngivning. Hvert forløb kan slås til og fra. Forløbene er LÅST: modulerne, minimum, emner og
--    modulplanens PDF kan kun rettes, når admin har trykket "Lås op" (logges). EU og Taxa har ingen plan endnu.
--    EU vælges ikke som forløb, men slås til på eleven (flueben "EU").
-- 2. Skolens kørelektioner under modulerne er fjernet (`module_lessons`, lektionsskemaet C + D).
-- 3. Teori: indstillingen "Teori registreres ved scanning" (til på B, fra på C, C/E og D). Er den fra, kan teori
--    ikke scannes; den lærer, der afslutter modulet, bekræfter antal teorilektioner (mindst minimum, medmindre
--    "Overført fra lektionsplan").
-- 4. Mørke: intet "I mørke"-flueben. Mørke-kravet er opfyldt, når en kørsel i modulet har emnet 7.19 bekræftet
--    (gemmes som `dark` på tællingen). Antallet i mørke tælles ikke.
-- 5. Startdato: modul 1 = holdets startdato, ellers elevens oprettelsesdato (kontoret kan rette den på eleven).
--    De øvrige moduler: første kørsel i modulet (kan rettes ved afslutning). Gemmes på afslutningen.
-- 6. "Undervisende kørelærere" vælges af kontoret på holdet (eller på eleven uden hold) og kommer øverst på planen.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Skolens kørelektioner fjernes.
drop function public.add_lesson_schedule(uuid, text);
drop function public.copy_module_lessons(uuid, uuid);
drop trigger apply_module_lesson on public.module_signoffs;
drop function private.apply_module_lesson();
alter table public.module_signoffs drop column module_lesson_id;
drop table public.module_lessons;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Faste forløb.
alter table public.courses
  add column kind text check (kind in ('B', 'C', 'CE', 'D', 'EU', 'TAXA')),     -- null = gammelt forløb (skjult)
  add column locked boolean not null default true,
  add column theory_at_scan boolean not null default false;                       -- "Teori registreres ved scanning"
create unique index courses_one_per_kind on public.courses (school_id, kind) where kind is not null;

-- Det faste forløb vælges blandt skolens forløb med styrelsens plan 1.1: det med flest elever, ellers det ældste.
with ranked as (
  select c.id, c.category_code,
         row_number() over (partition by c.school_id, c.category_code
                            order by (select count(*) from public.students s where s.course_id = c.id) desc, c.created_at) as rn
  from public.courses c
  where c.category_code in ('B', 'C', 'CE', 'D') and c.plan_version = '1.1'
)
update public.courses c set kind = r.category_code from ranked r where r.id = c.id and r.rn = 1;

-- De andre forløb med samme plan lægges sammen med det faste (elever, hold, tællinger og afslutninger flyttes til
-- modulet med samme nummer). Kun hvis alle modulnumre findes i det faste forløb.
create temp table course_map as
select o.id as old_id, t.id as new_id
from public.courses o
join public.courses t on t.school_id = o.school_id and t.kind = o.category_code
where o.kind is null and o.plan_version = '1.1' and o.category_code in ('B', 'C', 'CE', 'D')
  and not exists (
    select 1 from public.course_modules om
    where om.course_id = o.id
      and not exists (select 1 from public.course_modules tm where tm.course_id = t.id and tm.number = om.number));
create temp table module_map as
select om.id as old_id, tm.id as new_id
from course_map cm
join public.course_modules om on om.course_id = cm.old_id
join public.course_modules tm on tm.course_id = cm.new_id and tm.number = om.number;

alter table public.students disable trigger user;
alter table public.teams disable trigger user;
alter table public.module_signoffs disable trigger user;
alter table public.module_completions disable trigger user;
alter table public.course_modules disable trigger user;
alter table public.module_plan_templates disable trigger user;

update public.students s set course_id = cm.new_id, plan_template_id = private.newest_plan_template(cm.new_id)
from course_map cm where s.course_id = cm.old_id;
update public.teams t set course_id = cm.new_id from course_map cm where t.course_id = cm.old_id;
update public.module_signoffs x set course_module_id = mm.new_id from module_map mm where x.course_module_id = mm.old_id;
update public.module_completions x set course_module_id = mm.new_id from module_map mm where x.course_module_id = mm.old_id;
update public.module_plan_versions v set template_id = null
from public.module_plan_templates t join course_map cm on cm.old_id = t.course_id
where v.template_id = t.id;
delete from public.courses c using course_map cm where c.id = cm.old_id;

alter table public.students enable trigger user;
alter table public.teams enable trigger user;
alter table public.module_signoffs enable trigger user;
alter table public.module_completions enable trigger user;
alter table public.course_modules enable trigger user;
alter table public.module_plan_templates enable trigger user;
drop table module_map;
drop table course_map;

-- Gamle forløb, der ikke kunne lægges sammen, bliver liggende (data slettes ikke), men slås fra og skjules.
update public.courses set active = false, locked = false where kind is null;
update public.courses set name = left(name, 70) || ' (gammel)'
where kind is null and name in ('B', 'C', 'C/E', 'D', 'EU', 'Taxa');

update public.courses set
  name = case kind when 'CE' then 'C/E' when 'TAXA' then 'Taxa' else kind end,
  theory_at_scan = (kind = 'B')
where kind is not null;

-- Skolens faste forløb. B, C, C/E og D fra styrelsens plan 1.1; EU og Taxa uden plan og slået fra.
create function private.add_fixed_courses(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_course uuid;
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
  select p_school, x.category, x.name, 'modules', x.kind, false
  from (values ('EU', 'C', 'EU'), ('TAXA', 'B', 'Taxa')) x (kind, category, name)
  where not exists (select 1 from public.courses c where c.school_id = p_school and c.kind = x.kind);
end;
$$;

select private.add_fixed_courses(id) from public.schools;

create function private.add_school_fixed_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_fixed_courses(new.id);
  return null;
end;
$$;
create trigger add_fixed_courses after insert on public.schools
  for each row execute function private.add_school_fixed_courses();

-- Forløbene oprettes kun af Vixx. Det tomme modulforløb og skabelon-funktionen er ikke længere for admin.
drop function public.create_empty_module_course(uuid, text, text);
revoke execute on function public.create_module_course(uuid, text, text) from authenticated;
drop policy "Admin opretter forløb" on public.courses;
drop policy "Admin sletter forløb" on public.courses;
create policy "Admin sletter gamle forløb" on public.courses
  for delete to authenticated using (private.is_admin(school_id) and kind is null);

-- Et fast forløb beholder type, navn og kategori. Låst: modulplanens version og undervisningsdage kan ikke rettes.
create function private.guard_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.kind is distinct from old.kind
     or (old.kind is not null and (new.name, new.category_code) is distinct from (old.name, old.category_code)) then
    raise exception 'Forløbene er faste og kan ikke omdøbes.' using errcode = 'check_violation';
  end if;
  if old.locked and new.locked and (new.plan_version, new.min_days) is distinct from (old.plan_version, old.min_days) then
    raise exception 'Forløbet er låst. Tryk "Lås op" for at rette det.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_course before update on public.courses
  for each row execute function private.guard_course();

-- Modulerne og modulplanens PDF kan kun rettes, når forløbet er låst op.
create function private.guard_course_locked()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course uuid := coalesce((to_jsonb(new) ->> 'course_id')::uuid, (to_jsonb(old) ->> 'course_id')::uuid);
begin
  if current_user = 'authenticated'
     and (exists (select 1 from public.courses c where c.id = v_course and c.locked)
          or (tg_op = 'UPDATE' and exists (select 1 from public.courses c where c.id = old.course_id and c.locked))) then
    raise exception 'Forløbet er låst. Tryk "Lås op" for at rette det.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger guard_course_locked before insert or update or delete on public.course_modules
  for each row execute function private.guard_course_locked();
create trigger guard_course_locked before insert or update or delete on public.module_plan_templates
  for each row execute function private.guard_course_locked();

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Eleven: EU (flueben), startdato for modul 1 (kontoret kan rette).
alter table public.students
  add column eu boolean not null default false,
  add column course_start_on date;

-- EU vælges med fluebenet på eleven, ikke som elevens forløb.
create function private.check_student_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.courses c where c.id = new.course_id and c.kind = 'EU') then
    raise exception 'EU vælges med fluebenet "EU" på eleven.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger check_student_course before insert or update of course_id on public.students
  for each row execute function private.check_student_course();
create trigger check_student_course before insert or update of course_id on public.teams
  for each row execute function private.check_student_course();

-- Start af modul 1: elevens egen dato, ellers holdets startdato, ellers oprettelsesdatoen.
create function private.student_course_start(p_student uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.course_start_on, t.starts_on, (s.created_at at time zone 'Europe/Copenhagen')::date)
  from public.students s left join public.teams t on t.id = s.team_id
  where s.id = p_student;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Teori og mørke ved scanning.
create function private.check_signoff_theory()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind = 'theory' and tg_op = 'INSERT' and not exists (
    select 1 from public.course_modules m join public.courses c on c.id = m.course_id
    where m.id = new.course_module_id and c.theory_at_scan
  ) then
    raise exception 'Teori registreres ikke ved scanning på dette forløb. Den bekræftes, når modulet afsluttes.'
      using errcode = 'check_violation';
  end if;
  new.skipped_items := nullif(btrim(new.skipped_items), '');
  return new;
end;
$$;
create trigger check_signoff_theory before insert or update on public.module_signoffs
  for each row execute function private.check_signoff_theory();

-- Mørkekørsel kræver sin egen underskrift fra den lærer, der kørte lektionen (Michael 21. nov. 2026): Vixx gemmer
-- en kopi af lærerens underskrift på kørslen, når 7.19 bekræftes. Kolonnen hedder `dark_strokes` og kan ikke
-- læses via API'et (som de andre kopier); serveren læser den med service role til modulplanen.
alter table public.module_signoffs
  add column dark_strokes text check (dark_strokes ~ '^[ML0-9 .-]+$');

create function private.sign_dark_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.dark_strokes := case when new.dark then old.dark_strokes end;
    return new;
  end if;
  new.dark_strokes := null;
  if new.dark and new.instructor_id is not null then
    new.dark_strokes := private.instructor_signature(new.instructor_id);
    if new.dark_strokes is null and current_user = 'authenticated' then
      raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du bekræfter kørsel i mørke.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger sign_dark_signoff before insert or update on public.module_signoffs
  for each row execute function private.sign_dark_signoff();

revoke select on public.module_signoffs from authenticated;
grant select (id, school_id, student_id, course_module_id, kind, lesson_count, dark, instructor_id, instructor_name,
              signed_by, signed_at, lesson_date, comment, manual_gear, skipped_items)
  on public.module_signoffs to authenticated;
revoke all on function private.sign_dark_signoff() from public, anon;
grant execute on function private.sign_dark_signoff() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Afslutning: teori bekræftes af den afsluttende lærer (når teori ikke scannes), mørke = 7.19 bekræftet,
--    startdato gemmes.
alter table public.module_completions
  add column theory_lessons int check (theory_lessons between 0 and 100),
  add column started_on date;
update public.module_completions c set theory_lessons = m.min_theory + c.extra_theory
from public.course_modules m where m.id = c.course_module_id;

create or replace function private.guard_module_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_module public.course_modules;
  v_theory_at_scan boolean;
  v_theory int;
  v_driving int;
  v_dark boolean;
  v_first date;
begin
  if tg_op = 'UPDATE' then
    -- Kun annullering: admin, med begrundelse, af det seneste gældende afsluttede modul.
    if current_user = 'authenticated' and not private.is_admin(old.school_id) then
      raise exception 'Kun admin kan annullere en afslutning.' using errcode = 'insufficient_privilege';
    end if;
    if old.annulled_at is not null then
      raise exception 'Afslutningen er allerede annulleret.' using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - array['annulled_at', 'annulled_by', 'annul_reason']) is distinct from
       (to_jsonb(old) - array['annulled_at', 'annulled_by', 'annul_reason']) then
      raise exception 'En afslutning kan ikke rettes, kun annulleres.' using errcode = 'insufficient_privilege';
    end if;
    if exists (
      select 1 from public.module_completions c
      where c.student_id = old.student_id and c.annulled_at is null and c.module_number > old.module_number
    ) then
      raise exception 'Annullér først de senere moduler.' using errcode = 'check_violation';
    end if;
    if btrim(coalesce(new.annul_reason, '')) = '' then
      raise exception 'Skriv hvorfor afslutningen annulleres.' using errcode = 'check_violation';
    end if;
    new.annul_reason := btrim(new.annul_reason);
    new.annulled_at := now();
    new.annulled_by := coalesce((select auth.uid()), new.annulled_by);
    return new;
  end if;

  select m.* into v_module
  from public.course_modules m join public.students s on s.course_id = m.course_id
  where m.id = new.course_module_id and s.id = new.student_id and s.school_id = new.school_id and s.active;
  if v_module.id is null then
    raise exception 'Modulet hører ikke til elevens forløb.' using errcode = 'check_violation';
  end if;
  select c.theory_at_scan into v_theory_at_scan from public.courses c where c.id = v_module.course_id;

  if exists (
    select 1 from public.course_modules m
    where m.course_id = v_module.course_id and m.number < v_module.number
      and not exists (
        select 1 from public.module_completions c
        where c.student_id = new.student_id and c.course_module_id = m.id and c.annulled_at is null)
  ) then
    raise exception 'Modulerne afsluttes i rækkefølge. Afslut de forrige moduler først.' using errcode = 'check_violation';
  end if;

  select coalesce(sum(lesson_count) filter (where kind = 'theory'), 0),
         coalesce(sum(lesson_count) filter (where kind = 'driving'), 0),
         coalesce(bool_or(kind = 'driving' and dark), false),
         min(lesson_date) filter (where kind = 'driving')
    into v_theory, v_driving, v_dark, v_first
  from public.module_signoffs
  where student_id = new.student_id and course_module_id = new.course_module_id;

  -- Teori: talt ved scanning, eller bekræftet af den lærer, der afslutter.
  if not v_theory_at_scan then
    if new.theory_lessons is null then
      raise exception 'Skriv antal teorilektioner i modulet.' using errcode = 'check_violation';
    end if;
    v_theory := new.theory_lessons;
  end if;

  if not new.transferred then
    if v_theory < v_module.min_theory then
      raise exception 'Teorien har ikke nået minimum (%).', v_module.min_theory using errcode = 'check_violation';
    end if;
    if v_driving < v_module.min_driving then
      raise exception 'Kørslen har ikke nået minimum (%).', v_module.min_driving using errcode = 'check_violation';
    end if;
    if v_module.min_dark > 0 and not v_dark then
      raise exception 'Mangler: kørsel i mørke (7.19).' using errcode = 'check_violation';
    end if;
  end if;

  new.module_number := v_module.number;
  new.theory_lessons := v_theory;
  new.extra_theory := greatest(v_theory - v_module.min_theory, 0);
  new.extra_driving := greatest(v_driving - v_module.min_driving, 0);
  new.self_study := nullif(btrim(new.self_study), '');
  new.comment := nullif(btrim(new.comment), '');
  new.annulled_at := null;
  new.annulled_by := null;
  new.annul_reason := null;
  -- Start: modul 1 = forløbets start; de øvrige = første kørsel (læreren kan rette den), ellers i dag.
  if v_module.number = (select min(m.number) from public.course_modules m where m.course_id = v_module.course_id) then
    new.started_on := least(private.student_course_start(new.student_id), private.today_dk());
  else
    new.started_on := coalesce(new.started_on, v_first, private.today_dk());
  end if;
  if new.started_on > private.today_dk() then
    raise exception 'Startdatoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
  end if;

  if current_user = 'authenticated' then
    if new.instructor_id is null then
      -- Gæstelærer uden app: admin registrerer navn, dato og kommentar. Ingen erklæring i Vixx.
      if not private.is_admin(new.school_id) then
        raise exception 'Kun admin kan afslutte et modul for en gæstelærer.' using errcode = 'insufficient_privilege';
      end if;
      if btrim(coalesce(new.instructor_name, '')) = '' then
        raise exception 'Skriv gæstelærerens navn.' using errcode = 'check_violation';
      end if;
      if new.comment is null then
        raise exception 'Skriv en kommentar, fx hvorfor læreren ikke har Vixx.' using errcode = 'check_violation';
      end if;
      if new.completed_on is null or new.completed_on > private.today_dk() then
        raise exception 'Datoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
      end if;
      new.instructor_name := btrim(new.instructor_name);
      new.declaration := false;
    else
      if new.instructor_id not in (select private.my_instructor_ids()) then
        raise exception 'Du kan kun afslutte som dig selv.' using errcode = 'insufficient_privilege';
      end if;
      new.completed_on := private.today_dk();
      new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
      new.comment := null;
    end if;
    new.completed_by := (select auth.uid());
    new.completed_at := now();
  end if;
  return new;
end;
$$;

grant select (theory_lessons, started_on) on public.module_completions to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Undervisende kørelærere valgt af kontoret: på holdet (alle holdets elever) eller på eleven uden hold.
create table public.plan_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  team_id uuid,
  student_id uuid,
  instructor_id uuid not null,
  created_at timestamptz not null default now(),
  check ((team_id is null) <> (student_id is null)),
  foreign key (school_id, team_id) references public.teams (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade
);
create unique index plan_teachers_team on public.plan_teachers (team_id, instructor_id) where team_id is not null;
create unique index plan_teachers_student on public.plan_teachers (student_id, instructor_id) where student_id is not null;
create index plan_teachers_school_idx on public.plan_teachers (school_id);
create index plan_teachers_instructor_idx on public.plan_teachers (instructor_id);

alter table public.plan_teachers enable row level security;
revoke all on public.plan_teachers from anon, authenticated;
grant select, insert, delete on public.plan_teachers to authenticated;
grant all on public.plan_teachers to service_role;
create policy "Skolen ser undervisende kørelærere" on public.plan_teachers
  for select to authenticated using (private.is_member(school_id));
create policy "Kontoret vælger undervisende kørelærere" on public.plan_teachers
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret fjerner undervisende kørelærere" on public.plan_teachers
  for delete to authenticated using (private.is_staff(school_id));
create trigger write_audit after insert or delete on public.plan_teachers
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------------------------------------------
-- 7. Én scanning: tæl lektioner i modulet og afslut evt. modulet i samme tryk (alt eller intet). Kører som den,
--    der kalder (RLS og reglerne ovenfor gælder). Læreren er den indloggede.
create function public.record_scan(
  p_student uuid,
  p_module uuid,
  p_kind public.course_lesson_kind,
  p_count int,
  p_skipped text,
  p_dark boolean,
  p_manual_gear boolean,
  p_complete boolean,
  p_theory_lessons int,
  p_started_on date,
  p_self_study text,
  p_transferred boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_school uuid;
  v_instructor uuid;
begin
  select s.school_id into v_school from public.students s where s.id = p_student;
  select i.id into v_instructor from public.instructors i where i.school_id = v_school and i.user_id = (select auth.uid());
  if v_school is null or v_instructor is null then
    raise exception 'Du har ikke adgang til at kvittere for denne elev.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_count, 0) > 0 then
    insert into public.module_signoffs (school_id, student_id, course_module_id, kind, lesson_count, dark, manual_gear, instructor_id, skipped_items)
    values (v_school, p_student, p_module, p_kind, p_count, p_kind = 'driving' and coalesce(p_dark, false),
            p_kind = 'driving' and coalesce(p_manual_gear, false), v_instructor, case when p_kind = 'driving' then p_skipped end);
  elsif not coalesce(p_complete, false) then
    raise exception 'Vælg antal lektioner.' using errcode = 'check_violation';
  end if;
  if coalesce(p_complete, false) then
    insert into public.module_completions (school_id, student_id, course_module_id, module_number, instructor_id, declaration,
                                           transferred, self_study, theory_lessons, started_on)
    values (v_school, p_student, p_module, 0, v_instructor, true, coalesce(p_transferred, false), p_self_study,
            p_theory_lessons, p_started_on);
  end if;
end;
$$;
revoke all on function public.record_scan(uuid, uuid, public.course_lesson_kind, int, text, boolean, boolean, boolean, int, date, text, boolean)
  from public, anon;
grant execute on function public.record_scan(uuid, uuid, public.course_lesson_kind, int, text, boolean, boolean, boolean, int, date, text, boolean)
  to authenticated, service_role;

revoke all on function private.add_fixed_courses(uuid), private.add_school_fixed_courses(), private.guard_course(),
  private.guard_course_locked(), private.check_student_course(), private.student_course_start(uuid),
  private.check_signoff_theory() from public, anon;
grant execute on function private.add_fixed_courses(uuid), private.add_school_fixed_courses(), private.guard_course(),
  private.guard_course_locked(), private.check_student_course(), private.student_course_start(uuid),
  private.check_signoff_theory() to authenticated, service_role;
