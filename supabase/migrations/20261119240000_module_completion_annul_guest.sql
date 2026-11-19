-- Trin E8, del 4b (19. nov. 2026, aftalt med Michael):
-- 1. Admin kan annullere en fejlagtig afslutning med begrundelse. Den slettes ikke, men markeres annulleret
--    (hvem, hvornår, hvorfor) og logges. Modulet er åbent igen. Kun det seneste afsluttede modul kan annulleres,
--    så rækkefølgen holder.
-- 2. Admin kan registrere en afslutning for en gæstelærer uden app: gæstelærerens navn, dato og kommentar.
--    Admin afgiver ikke erklæringen; den afgiver gæstelæreren med kuglepen på den udskrevne modulplan, og Vixx
--    sætter aldrig en tegnet underskrift på en sådan afslutning.

alter table public.module_completions
  add column comment text check (char_length(comment) <= 500),
  add column annulled_at timestamptz,
  add column annulled_by uuid references auth.users (id),
  add column annul_reason text check (char_length(annul_reason) <= 500),
  alter column instructor_id drop not null,
  drop constraint module_completions_declaration_check,
  add constraint module_completions_declaration_check check (declaration or instructor_id is null),
  add constraint module_completions_guest_check check (
    instructor_id is not null or (btrim(instructor_name) <> '' and btrim(coalesce(comment, '')) <> '')),
  add constraint module_completions_annul_check check (
    (annulled_at is null and annulled_by is null and annul_reason is null)
    or (annulled_at is not null and annulled_by is not null and btrim(coalesce(annul_reason, '')) <> ''));

-- Et modul kan kun have én gældende afslutning; annullerede bliver liggende.
alter table public.module_completions drop constraint module_completions_student_id_course_module_id_key;
create unique index module_completions_one_valid on public.module_completions (student_id, course_module_id)
  where annulled_at is null;

create or replace function private.guard_module_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_module public.course_modules;
  v_theory int;
  v_driving int;
  v_dark int;
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
         coalesce(sum(lesson_count) filter (where kind = 'driving' and dark), 0)
    into v_theory, v_driving, v_dark
  from public.module_signoffs
  where student_id = new.student_id and course_module_id = new.course_module_id;

  if not new.transferred
     and (v_theory < v_module.min_theory or v_driving < v_module.min_driving or v_dark < v_module.min_dark) then
    raise exception 'Modulets minimum er ikke nået.' using errcode = 'check_violation';
  end if;

  new.module_number := v_module.number;
  new.extra_theory := greatest(v_theory - v_module.min_theory, 0);
  new.extra_driving := greatest(v_driving - v_module.min_driving, 0);
  new.self_study := nullif(btrim(new.self_study), '');
  new.comment := nullif(btrim(new.comment), '');
  new.annulled_at := null;
  new.annulled_by := null;
  new.annul_reason := null;

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

drop trigger guard_module_completion on public.module_completions;
create trigger guard_module_completion before insert or update on public.module_completions
  for each row execute function private.guard_module_completion();

-- Tællinger blokeres kun af en gældende (ikke annulleret) afslutning.
create or replace function private.block_completed_module_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
       select 1 from public.module_completions c
       where c.student_id = new.student_id and c.course_module_id = new.course_module_id and c.annulled_at is null)
     or (tg_op = 'UPDATE' and exists (
       select 1 from public.module_completions c
       where c.student_id = old.student_id and c.course_module_id = old.course_module_id and c.annulled_at is null)) then
    raise exception 'Modulet er afsluttet og kan ikke ændres.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

grant update on public.module_completions to authenticated;
drop policy "Læreren afslutter moduler" on public.module_completions;
create policy "Læreren afslutter moduler, admin for gæstelærere" on public.module_completions
  for insert to authenticated with check (
    instructor_id in (select private.my_instructor_ids())
    or (instructor_id is null and private.is_admin(school_id))
  );
create policy "Admin annullerer afslutninger" on public.module_completions
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
-- Stadig ingen slette-regel.

drop trigger write_audit on public.module_completions;
create trigger write_audit after insert or update on public.module_completions
  for each row execute function private.write_audit();
