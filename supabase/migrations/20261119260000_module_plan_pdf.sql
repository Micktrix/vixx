-- Trin E8, del 6a: Vixx udfylder Færdselsstyrelsens modulplan (PDF) med lærernes underskrifter (19. nov. 2026).
-- Færdselsstyrelsen har sagt ok til den digitale underskrift. Aftalt med Michael:
--   - Læreren skal have gemt sin underskrift ("Min underskrift") for at kunne afslutte et modul. Vixx gemmer en
--     kopi på afslutningen, så en ny underskrift senere ikke ændrer gamle moduler. Gæstelærere skriver under
--     med kuglepen (ingen underskrift i Vixx).
--   - "Undervisende kørelærere": Vixx tilføjer læreren første gang, læreren har eleven (tæller lektioner eller
--     afslutter et modul), med en kopi af underskriften.
--   - Kontoret taster elevens adresse (modulplanens forside).
--   - Alle lærere, kontor og admin kan altid printe. Hver udfyldt udgave gemmes som en version, der aldrig
--     overskrives eller slettes (Storage-bucketten "module-plans", kun serveren læser og skriver).

alter table public.students
  add column address text check (char_length(address) <= 200);

-- Lærerens gemte underskrift (stregdata). Security definer, fordi kun læreren selv kan se tabellen; bruges kun
-- af triggerne her til at tage en kopi.
create function private.instructor_signature(p_instructor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.strokes
  from public.instructor_signatures s
  join public.instructors i on i.user_id = s.user_id and i.school_id = s.school_id
  where i.id = p_instructor;
$$;

-- Kopi af underskriften på afslutningen. Kolonnen hedder `strokes`, så ændringsloggen ikke skriver stregerne.
alter table public.module_completions
  add column strokes text check (strokes ~ '^[ML0-9 .-]+$');

create function private.sign_module_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    return new;  -- kun annullering er tilladt (guard_module_completion); kopien ændres aldrig
  end if;
  if new.instructor_id is null then
    new.strokes := null;  -- gæstelærer: skriver under med kuglepen
    return new;
  end if;
  new.strokes := private.instructor_signature(new.instructor_id);
  if new.strokes is null and current_user = 'authenticated' then
    raise exception 'Gem din underskrift under Beskeder → Min underskrift, før du afslutter et modul.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Kører efter guard_module_completion (triggere kører i alfabetisk rækkefølge).
create trigger sign_module_completion before insert or update on public.module_completions
  for each row execute function private.sign_module_completion();

-- Undervisende kørelærere på elevens modulplan.
create table public.module_plan_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  instructor_id uuid,                                    -- null = gæstelærer (registreret af admin)
  instructor_name text not null,
  strokes text check (strokes ~ '^[ML0-9 .-]+$'),
  first_on date not null,
  created_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id)
);
create unique index module_plan_teachers_instructor on public.module_plan_teachers (student_id, instructor_id)
  where instructor_id is not null;
create unique index module_plan_teachers_guest on public.module_plan_teachers (student_id, instructor_name)
  where instructor_id is null;
create index module_plan_teachers_school_idx on public.module_plan_teachers (school_id);
create index module_plan_teachers_instructor_idx on public.module_plan_teachers (instructor_id);

create function private.add_module_plan_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Tællinger har lesson_date, afslutninger completed_on.
  v_date date := coalesce((to_jsonb(new) ->> 'completed_on')::date, (to_jsonb(new) ->> 'lesson_date')::date);
begin
  if new.instructor_id is null then
    if tg_table_name = 'module_completions' then
      insert into public.module_plan_teachers (school_id, student_id, instructor_id, instructor_name, first_on)
      values (new.school_id, new.student_id, null, new.instructor_name, v_date)
      on conflict (student_id, instructor_name) where instructor_id is null do nothing;
    end if;
    return null;
  end if;
  insert into public.module_plan_teachers (school_id, student_id, instructor_id, instructor_name, strokes, first_on)
  values (new.school_id, new.student_id, new.instructor_id, new.instructor_name,
          private.instructor_signature(new.instructor_id), v_date)
  on conflict (student_id, instructor_id) where instructor_id is not null do update
    -- Første kopi af underskriften gælder; mangler den (læreren havde ingen endnu), tages den nu.
    set strokes = coalesce(public.module_plan_teachers.strokes, excluded.strokes),
        first_on = least(public.module_plan_teachers.first_on, excluded.first_on);
  return null;
end;
$$;

create trigger add_module_plan_teacher after insert on public.module_signoffs
  for each row execute function private.add_module_plan_teacher();
create trigger add_module_plan_teacher after insert on public.module_completions
  for each row execute function private.add_module_plan_teacher();

alter table public.module_plan_teachers enable row level security;
revoke all on public.module_plan_teachers from anon, authenticated;
grant select on public.module_plan_teachers to authenticated;   -- skrives kun af triggeren
grant all on public.module_plan_teachers to service_role;
create policy "Skolen ser undervisende kørelærere, eleven sine egne" on public.module_plan_teachers
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );

-- Gemte udgaver af elevens udfyldte modulplan. Skrives kun af serveren (service role); kan ikke slettes.
create table public.module_plan_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  template text not null check (char_length(template) <= 40),        -- fx "B-1.1"
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'), -- sha256 af indholdet
  storage_path text not null check (char_length(storage_path) <= 300),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (student_id, content_hash),
  foreign key (school_id, student_id) references public.students (school_id, id)
);
create index module_plan_versions_school_idx on public.module_plan_versions (school_id);

alter table public.module_plan_versions enable row level security;
revoke all on public.module_plan_versions from anon, authenticated;
grant select on public.module_plan_versions to authenticated;
grant all on public.module_plan_versions to service_role;
create policy "Skolen ser modulplanens udgaver, eleven sine egne" on public.module_plan_versions
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );

create trigger write_audit after insert on public.module_plan_versions
  for each row execute function private.write_audit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('module-plans', 'module-plans', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Skemaet private er ikke tilgængeligt via API'et; funktionerne bruges kun af triggerne.
revoke all on function private.instructor_signature(uuid), private.sign_module_completion(), private.add_module_plan_teacher()
  from public, anon;
grant execute on function private.instructor_signature(uuid), private.sign_module_completion(), private.add_module_plan_teacher()
  to authenticated, service_role;

-- Kopierne af underskrifterne kan ikke læses via API'et (kun læreren selv ser sin underskrift). Serveren læser
-- dem med service role, når den har tjekket adgangen, og tegner dem på modulplanen.
revoke select on public.module_completions from authenticated;
grant select (id, school_id, student_id, course_module_id, module_number, completed_on, instructor_id, instructor_name,
              completed_by, completed_at, declaration, transferred, self_study, extra_theory, extra_driving, comment,
              annulled_at, annulled_by, annul_reason)
  on public.module_completions to authenticated;
revoke select on public.module_plan_teachers from authenticated;
grant select (id, school_id, student_id, instructor_id, instructor_name, first_on, created_at)
  on public.module_plan_teachers to authenticated;

-- Gemmer læreren sin underskrift senere, end læreren første gang havde eleven, sættes den på de pladser under
-- "Undervisende kørelærere", der står uden underskrift. Kopier, der allerede er sat, ændres ikke.
create function private.fill_missing_teacher_signatures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.module_plan_teachers t
  set strokes = new.strokes
  from public.instructors i
  where i.user_id = new.user_id and i.school_id = new.school_id
    and t.instructor_id = i.id and t.strokes is null;
  return null;
end;
$$;

create trigger fill_missing_teacher_signatures after insert or update of strokes on public.instructor_signatures
  for each row execute function private.fill_missing_teacher_signatures();

revoke all on function private.fill_missing_teacher_signatures() from public, anon;
grant execute on function private.fill_missing_teacher_signatures() to authenticated, service_role;
