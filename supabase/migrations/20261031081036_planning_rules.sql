-- Trin 5: regler for planlægning.
-- 1) Lektioner og registreringer gemmer kategorien (en ydelse kan dække flere kategorier).
-- 2) Ingen overlap for en lærer: lektion/lektion, lektion/fravær, fravær/fravær og lektion i godkendt ferie.
--    Håndhæves i databasen med en lås pr. lærer, så to samtidige planlægninger ikke kan overlappe.
-- 3) Kun ydelser, læreren har kompetence til (kategori + type), og kun aktive ydelser/satser.
-- 4) Ferie kan ikke godkendes, mens der ligger planlagte lektioner i perioden.

-- ---------------------------------------------------------------------------
-- Kategori på lektioner og registreringer
-- ---------------------------------------------------------------------------
alter table public.scheduled_lessons add column category_code text references public.license_categories (code);
alter table public.registrations add column category_code text references public.license_categories (code);

update public.scheduled_lessons l
set category_code = (select min(c.category_code) from public.service_categories c where c.service_id = l.service_id);
update public.registrations r
set category_code = (select min(c.category_code) from public.service_categories c where c.service_id = r.service_id);

alter table public.scheduled_lessons alter column category_code set not null;
alter table public.registrations alter column category_code set not null;

-- Tidsrum som timestamp-interval, så vi ikke rammer time-typens midnat.
create function private.time_span(p_date date, p_start time, p_minutes numeric)
returns tsrange
language sql
immutable
set search_path = ''
as $$
  select tsrange(p_date + p_start, p_date + p_start + make_interval(secs => p_minutes * 60), '[)');
$$;

create function private.hhmm(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_time, 'HH24:MI');
$$;

-- Fælles for lektioner og registreringer: kategori fra ydelsen, og for appens brugere
-- (ikke seed/server) at ydelsen er i brug, og at læreren har kompetencen.
create function private.check_service_choice(
  p_school uuid, p_instructor uuid, p_service uuid, inout p_category text, p_date date, p_check_access boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type uuid;
begin
  if p_category is null then
    -- Kun én kategori på ydelsen: den bruges automatisk.
    select min(c.category_code) into p_category
    from public.service_categories c
    where c.service_id = p_service
    having count(*) = 1;
    if p_category is null then
      raise exception 'Vælg kategori for ydelsen.' using errcode = 'check_violation';
    end if;
  end if;

  if not exists (select 1 from public.service_categories c where c.service_id = p_service and c.category_code = p_category) then
    raise exception 'Ydelsen dækker ikke kategori %.', p_category using errcode = 'check_violation';
  end if;

  if not p_check_access then
    return;
  end if;

  select s.lesson_type_id into v_type
  from public.services s
  join public.rate_groups g on g.id = s.rate_group_id
  where s.id = p_service and s.school_id = p_school and s.active and g.active;
  if v_type is null then
    raise exception 'Ydelsen er slået fra og kan ikke vælges.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from public.instructors i
    join public.school_members m on m.school_id = i.school_id and m.user_id = i.user_id
    where i.id = p_instructor and i.active and m.active
      and (i.active_until is null or i.active_until >= p_date)
  ) then
    raise exception 'Læreren er ikke aktiv på datoen.' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.instructor_categories ic where ic.instructor_id = p_instructor and ic.category_code = p_category)
     or not exists (select 1 from public.instructor_lesson_types it where it.instructor_id = p_instructor and it.lesson_type_id = v_type) then
    raise exception 'Læreren har ikke kompetence til ydelsen (kategori %).', p_category using errcode = 'check_violation';
  end if;
end;
$$;

-- Hvad optager læreren i tidsrummet? Returnerer en dansk forklaring eller null.
create function private.instructor_conflict(
  p_instructor uuid, p_span tsrange, p_ignore_lesson uuid, p_ignore_absence uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  select 'Læreren har ferie den dag.' into v_text
  from public.holidays h
  where h.instructor_id = p_instructor and h.status = 'approved'
    and lower(p_span)::date between h.from_date and h.to_date
  limit 1;
  if v_text is not null then return v_text; end if;

  select format('Læreren har allerede en lektion kl. %s–%s.',
                private.hhmm(l.start_time),
                private.hhmm((upper(private.time_span(l.lesson_date, l.start_time, l.lesson_count * l.lesson_minutes)))::time))
    into v_text
  from public.scheduled_lessons l
  where l.instructor_id = p_instructor
    and l.id is distinct from p_ignore_lesson
    and l.lesson_date between lower(p_span)::date - 1 and upper(p_span)::date
    and private.time_span(l.lesson_date, l.start_time, l.lesson_count * l.lesson_minutes) && p_span
  order by l.start_time
  limit 1;
  if v_text is not null then return v_text; end if;

  select format('Læreren har fravær kl. %s–%s.',
                private.hhmm(a.start_time),
                private.hhmm((upper(private.time_span(a.absence_date, a.start_time, a.hours * 60)))::time))
    into v_text
  from public.absences a
  where a.instructor_id = p_instructor
    and a.id is distinct from p_ignore_absence
    and a.absence_date between lower(p_span)::date - 1 and upper(p_span)::date
    and private.time_span(a.absence_date, a.start_time, a.hours * 60) && p_span
  order by a.start_time
  limit 1;
  return v_text;
end;
$$;

-- BEFORE-triggere kører før RLS' WITH CHECK. Derfor tjekker vi adgangen først, så en bruger uden
-- ret aldrig får at vide, hvornår en anden lærer er optaget.
-- security invoker: current_user skal være den kaldende rolle, ikke funktionens ejer.
create function private.require_planning_access(p_school uuid, p_instructor uuid, p_staff_only boolean)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return;
  end if;
  if private.is_staff(p_school) then
    return;
  end if;
  if not p_staff_only and p_instructor in (select private.my_instructor_ids()) then
    return;
  end if;
  raise exception 'Du har ikke adgang til at ændre dette.' using errcode = 'insufficient_privilege';
end;
$$;

-- Lås pr. lærer i transaktionen, så samtidige ændringer for samme lærer køres efter hinanden.
create function private.lock_instructor(p_instructor uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_instructor::text, 0));
$$;

-- ---------------------------------------------------------------------------
-- Planlagte lektioner
-- ---------------------------------------------------------------------------
create function private.guard_scheduled_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict text;
  v_changed boolean := tg_op = 'INSERT'
    or new.instructor_id is distinct from old.instructor_id
    or new.service_id is distinct from old.service_id
    or new.category_code is distinct from old.category_code
    or new.lesson_date is distinct from old.lesson_date;
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, new.origin = 'office');
  if v_changed then
    new.category_code := private.check_service_choice(
      new.school_id, new.instructor_id, new.service_id, new.category_code, new.lesson_date,
      current_user = 'authenticated'
    );
  end if;

  if tg_op = 'INSERT'
     or new.instructor_id is distinct from old.instructor_id
     or new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.lesson_count is distinct from old.lesson_count then
    perform private.lock_instructor(new.instructor_id);
    v_conflict := private.instructor_conflict(
      new.instructor_id,
      private.time_span(new.lesson_date, new.start_time, new.lesson_count * new.lesson_minutes),
      new.id, null
    );
    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Navnet sorterer efter fill_lesson_minutes, så lektionslængden er udfyldt.
create trigger guard_scheduled_lesson before insert or update on public.scheduled_lessons
  for each row execute function private.guard_scheduled_lesson();

-- ---------------------------------------------------------------------------
-- Registreringer: kategori og kompetence (overlap afklares i trin 6)
-- ---------------------------------------------------------------------------
create function private.guard_registration_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, false);
  if tg_op = 'INSERT'
     or new.instructor_id is distinct from old.instructor_id
     or new.service_id is distinct from old.service_id
     or new.category_code is distinct from old.category_code then
    new.category_code := private.check_service_choice(
      new.school_id, new.instructor_id, new.service_id, new.category_code, new.lesson_date,
      current_user = 'authenticated'
    );
  end if;
  return new;
end;
$$;

create trigger guard_registration_service before insert or update on public.registrations
  for each row execute function private.guard_registration_service();

-- ---------------------------------------------------------------------------
-- Fravær
-- ---------------------------------------------------------------------------
create function private.guard_absence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict text;
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, true);
  perform private.lock_instructor(new.instructor_id);
  v_conflict := private.instructor_conflict(
    new.instructor_id,
    private.time_span(new.absence_date, new.start_time, new.hours * 60),
    null, new.id
  );
  -- Fravær i en godkendt ferie er uskadeligt; kun lektioner og andet fravær blokerer.
  if v_conflict is not null and v_conflict <> 'Læreren har ferie den dag.' then
    raise exception '%', v_conflict using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger guard_absence before insert or update on public.absences
  for each row execute function private.guard_absence();

-- ---------------------------------------------------------------------------
-- Ferie: kan ikke godkendes, mens der ligger lektioner i perioden
-- ---------------------------------------------------------------------------
create function private.guard_holiday_lessons()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
  v_first date;
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, false);
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status <> 'approved'
          or new.from_date <> old.from_date or new.to_date <> old.to_date
          or new.instructor_id <> old.instructor_id) then
    perform private.lock_instructor(new.instructor_id);
    select count(*), min(l.lesson_date) into v_count, v_first
    from public.scheduled_lessons l
    where l.instructor_id = new.instructor_id
      and l.lesson_date between new.from_date and new.to_date;
    if v_count > 0 then
      raise exception 'Læreren har % planlagt% lektion% i perioden (første %). Flyt eller fjern dem først.',
        v_count, case when v_count = 1 then '' else 'e' end, case when v_count = 1 then '' else 'er' end,
        to_char(v_first, 'DD-MM-YYYY')
        using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Sorterer efter guard_holiday, som tvinger lærerens egne anmodninger til "afventer".
create trigger guard_holiday_lessons before insert or update on public.holidays
  for each row execute function private.guard_holiday_lessons();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
