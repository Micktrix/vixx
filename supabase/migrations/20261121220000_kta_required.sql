-- KTA (Michael, 21. nov. 2026): afsnit 9 (manøvrer på køreteknisk anlæg) i sidste modul behandles som mørke.
-- Det har ikke flueben fra start ved scanning og skal bekræftes ("Ja, kørt på køreteknisk anlæg"). Modulet kan ikke
-- afsluttes, før KTA er kørt i modulet (en kørsel uden afsnit 9 blandt de ikke kørte emner) eller er markeret
-- gennemført i faktaboksen, medmindre eleven er overført fra lektionsplanen.

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
  v_kta text;
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
    -- KTA (afsnit 9, køreteknisk anlæg) skal være bekræftet ved scanning eller markeret gennemført i faktaboksen.
    select btrim(t) into v_kta
    from regexp_split_to_table(coalesce(v_module.topics, ''), E'\n') t
    where btrim(t) ~ '^(9\.[0-9]|Afsnit 9 [–-])'
    limit 1;
    if v_kta is not null
       and not exists (
         select 1 from public.module_signoffs x
         where x.student_id = new.student_id and x.course_module_id = new.course_module_id and x.kind = 'driving'
           and not exists (
             select 1 from regexp_split_to_table(coalesce(x.skipped_items, ''), E'\n') s where btrim(s) = v_kta))
       and not exists (
         select 1 from public.student_appointments a
         where a.student_id = new.student_id and a.kind = 'kta' and a.status = 'passed') then
      raise exception 'Mangler: KTA (afsnit 9, køreteknisk anlæg).' using errcode = 'check_violation';
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
