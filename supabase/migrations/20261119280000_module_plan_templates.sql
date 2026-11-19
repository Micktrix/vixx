-- Trin E8, del 6c-1 (19. nov. 2026, aftalt med Michael): skolen skifter selv modulplanens PDF.
-- - Hvert modulforløb ("plan", fx B, C/E eller "C/E med EU") har en eller flere versioner af Færdselsstyrelsens
--   PDF (`module_plan_templates`). Version 1.1 for B, C, C/E og D er indbygget (filerne ligger i Vixx).
-- - Admin lægger en ny version op. Vixx genkender felterne og gemmer et feltkort; admin retter manglende felter,
--   ser et prøvetryk og tager versionen i brug. Gamle versioner gemmes, så elevernes planer kan vises igen.
-- - Version pr. elev: nye elever får forløbets nyeste version i brug; elever i gang beholder deres, medmindre
--   admin flytter dem. Modulerne (minimum og emner) er forløbets og ændres ikke af en ny PDF.
-- - Plads til flere planer pr. kategori (fx EU): admin kan oprette et tomt modulforløb og bygge modulerne selv.
--   Elever med to planer kommer i 6c-2.

create table public.module_plan_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  course_id uuid not null,
  version text not null check (char_length(btrim(version)) between 1 and 20),   -- fx "1.1" eller "1.2"
  builtin text check (builtin in ('B-1.1', 'C-1.1', 'CE-1.1', 'D-1.1')),       -- indbygget PDF i Vixx
  storage_path text check (char_length(storage_path) <= 300),                   -- opsendt PDF (bucket module-plan-templates)
  field_map jsonb,                                                              -- feltkort (null = genkendes automatisk)
  activated_at timestamptz,                                                     -- null = kladde
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check ((builtin is null) <> (storage_path is null)),
  check (activated_at is null or builtin is not null or field_map is not null),
  unique (course_id, version),
  unique (school_id, id),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index module_plan_templates_school_idx on public.module_plan_templates (school_id);

-- Kun modulforløb har PDF-versioner. En version i brug kan ikke ændres eller tages ud af brug, så elevernes
-- planer altid kan vises igen; en kladde kan rettes og slettes.
create function private.guard_module_plan_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.activated_at is not null then
      raise exception 'En version i brug kan ikke slettes.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if not exists (select 1 from public.courses c where c.id = new.course_id and c.plan_kind = 'modules') then
    raise exception 'Kun modulforløb har en modulplan (PDF).' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.activated_at is not null
     and (to_jsonb(new) - 'created_at') is distinct from (to_jsonb(old) - 'created_at') then
    raise exception 'En version i brug kan ikke ændres.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_module_plan_template before insert or update or delete on public.module_plan_templates
  for each row execute function private.guard_module_plan_template();

alter table public.module_plan_templates enable row level security;
revoke all on public.module_plan_templates from anon, authenticated;
grant select, insert, update, delete on public.module_plan_templates to authenticated;
grant all on public.module_plan_templates to service_role;

create policy "Skolen ser modulplanernes versioner" on public.module_plan_templates
  for select to authenticated using (private.is_member(school_id));
create policy "Admin lægger modulplaner op" on public.module_plan_templates
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter modulplaner" on public.module_plan_templates
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter kladder" on public.module_plan_templates
  for delete to authenticated using (private.is_admin(school_id));

create trigger write_audit after insert or update or delete on public.module_plan_templates
  for each row execute function private.write_audit();

-- Elevens version af modulplanen.
alter table public.students
  add column plan_template_id uuid,
  add constraint students_plan_template_fk foreign key (school_id, plan_template_id)
    references public.module_plan_templates (school_id, id);
create index students_plan_template_idx on public.students (plan_template_id);

-- Forløbets nyeste version i brug.
create function private.newest_plan_template(p_course uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.module_plan_templates t
  where t.course_id = p_course and t.activated_at is not null
  order by t.activated_at desc, t.created_at desc
  limit 1;
$$;

-- Ny elev eller nyt forløb: nyeste version. Ellers beholder eleven sin; kun admin kan flytte eleven, og kun til
-- en version i brug af elevens eget forløb.
create function private.set_student_plan_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.course_id is distinct from old.course_id then
    new.plan_template_id := private.newest_plan_template(new.course_id);
    return new;
  end if;
  if new.plan_template_id is distinct from old.plan_template_id then
    if current_user = 'authenticated' and not private.is_admin(new.school_id) then
      raise exception 'Kun admin kan flytte en elev til en anden version af modulplanen.' using errcode = 'insufficient_privilege';
    end if;
    if new.plan_template_id is not null and not exists (
      select 1 from public.module_plan_templates t
      where t.id = new.plan_template_id and t.course_id = new.course_id and t.activated_at is not null
    ) then
      raise exception 'Vælg en version i brug af elevens forløb.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger set_student_plan_template before insert or update on public.students
  for each row execute function private.set_student_plan_template();

-- Indbyggede versioner (1.1) til de modulforløb, der findes, og elevernes version.
insert into public.module_plan_templates (school_id, course_id, version, builtin, activated_at)
select c.school_id, c.id, c.plan_version, c.category_code || '-' || c.plan_version, now()
from public.courses c
where c.plan_kind = 'modules' and (c.category_code || '-' || c.plan_version) in ('B-1.1', 'C-1.1', 'CE-1.1', 'D-1.1');
update public.students s set plan_template_id = private.newest_plan_template(s.course_id)
where exists (select 1 from public.courses c where c.id = s.course_id and c.plan_kind = 'modules');

-- Modulforløb fra Færdselsstyrelsens skabelon får den indbyggede PDF i brug med det samme.
create function private.add_builtin_plan_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_kind = 'modules' and (new.category_code || '-' || new.plan_version) in ('B-1.1', 'C-1.1', 'CE-1.1', 'D-1.1') then
    insert into public.module_plan_templates (school_id, course_id, version, builtin, activated_at, created_by)
    values (new.school_id, new.id, new.plan_version, new.category_code || '-' || new.plan_version, now(), auth.uid());
  end if;
  return null;
end;
$$;

create trigger add_builtin_plan_template after insert on public.courses
  for each row execute function private.add_builtin_plan_template();

-- Tomt modulforløb (fx EU-moduler): admin bygger modulerne og lægger PDF'en op. Kører som den, der kalder (RLS).
create function public.create_empty_module_course(p_school_id uuid, p_category text, p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_course uuid;
begin
  insert into public.courses (school_id, category_code, name, plan_kind)
  values (p_school_id, p_category, p_name, 'modules')
  returning id into v_course;
  return v_course;
end;
$$;
revoke all on function public.create_empty_module_course(uuid, text, text) from public, anon;
grant execute on function public.create_empty_module_course(uuid, text, text) to authenticated, service_role;

-- Gemte udfyldte udgaver husker, hvilken version de er lavet fra.
alter table public.module_plan_versions
  add column template_id uuid references public.module_plan_templates (id);

-- Opsendte PDF'er: privat bucket, kun serveren læser og skriver. Højst 20 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('module-plan-templates', 'module-plan-templates', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

revoke all on function private.guard_module_plan_template(), private.newest_plan_template(uuid),
  private.set_student_plan_template(), private.add_builtin_plan_template() from public, anon;
grant execute on function private.guard_module_plan_template(), private.newest_plan_template(uuid),
  private.set_student_plan_template(), private.add_builtin_plan_template() to authenticated, service_role;
