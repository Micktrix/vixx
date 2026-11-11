-- Lektionsplan (11. nov. 2026). Skolen har faste lektionstider med pauser, fx
--   08:00 08:45 | pause | 10:00 10:45 | pause | 12:00 12:45 | pause | 13:45 14:30.
-- 8 lektioner fra 08:00 slutter derfor kl. 15:15, ikke 14:00.
-- * schools.lesson_starts: planens starttider. Hver lektion varer skolens lektionslængde.
-- * span_minutes: lektionens samlede længde inkl. pauser. Udfyldes af databasen ud fra planen og
--   gemmes, så en senere ændring af planen ikke flytter gamle lektioner. end_time følger den.
-- * Appens brugere kan kun starte på planens tider. Går en blok ud over planen, fortsætter
--   lektionerne i forlængelse uden pauser.
-- * Overlap og bookinger bruger span_minutes; læreren er optaget hele blokken, også i pauserne.

alter table public.schools
  add column lesson_starts time[] not null default '{08:00,08:45,10:00,10:45,12:00,12:45,13:45,14:30}';

-- Samlet længde i minutter for et antal lektioner fra en starttid.
create function private.lesson_span(p_starts time[], p_start time, p_count int, p_minutes int)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  i int := array_position(p_starts, p_start);
  v_end timestamp := '2000-01-01'::date + p_start;
begin
  for k in 0 .. p_count - 1 loop
    if i is not null and i + k <= coalesce(array_length(p_starts, 1), 0)
       and '2000-01-01'::date + p_starts[i + k] >= v_end then
      v_end := '2000-01-01'::date + p_starts[i + k] + make_interval(mins => p_minutes);
    else
      v_end := v_end + make_interval(mins => p_minutes);
    end if;
  end loop;
  return (extract(epoch from v_end - ('2000-01-01'::date + p_start)) / 60)::int;
end;
$$;

-- Planen skal stå i rækkefølge, og lektionerne må ikke overlappe hinanden.
create function private.guard_lesson_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(array_length(new.lesson_starts, 1), 0) = 0 then
    raise exception 'Lektionsplanen skal have mindst én starttid.' using errcode = 'check_violation';
  end if;
  for k in 2 .. array_length(new.lesson_starts, 1) loop
    if new.lesson_starts[k] < new.lesson_starts[k - 1] + make_interval(mins => new.lesson_minutes) then
      raise exception 'Lektionen kl. % starter, før lektionen kl. % er slut.',
        to_char(new.lesson_starts[k], 'HH24:MI'), to_char(new.lesson_starts[k - 1], 'HH24:MI')
        using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create trigger guard_lesson_plan before insert or update of lesson_starts, lesson_minutes on public.schools
  for each row execute function private.guard_lesson_plan();

-- Samlet længde på lektioner og registreringer.
alter table public.scheduled_lessons add column span_minutes int;
alter table public.registrations add column span_minutes int;

-- Udfyld længden ud fra planen. Navnet sorterer efter fill_lesson_minutes og før guard-triggerne.
-- security invoker: current_user skal være den kaldende rolle, så reglen om starttider gælder appens brugere.
create function private.fill_lesson_span()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_starts time[];
begin
  if tg_op = 'UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.lesson_count is not distinct from old.lesson_count
     and new.lesson_minutes is not distinct from old.lesson_minutes
     and old.span_minutes is not null then
    new.span_minutes := old.span_minutes;
    return new;
  end if;

  select s.lesson_starts into v_starts from public.schools s where s.id = new.school_id;
  if current_user = 'authenticated'
     and (tg_op = 'INSERT' or new.start_time is distinct from old.start_time)
     and not (new.start_time = any (v_starts)) then
    raise exception 'Vælg en af skolens starttider (%).',
      (select string_agg(to_char(t, 'HH24:MI'), ', ') from unnest(v_starts) t)
      using errcode = 'check_violation';
  end if;
  new.span_minutes := private.lesson_span(v_starts, new.start_time, new.lesson_count, new.lesson_minutes);
  return new;
end;
$$;

-- Eksisterende lektioner og registreringer følger planen (før triggerne findes).
update public.scheduled_lessons l
set span_minutes = private.lesson_span(s.lesson_starts, l.start_time, l.lesson_count, l.lesson_minutes)
from public.schools s where s.id = l.school_id;
update public.registrations r
set span_minutes = private.lesson_span(s.lesson_starts, r.start_time, r.lesson_count, r.lesson_minutes)
from public.schools s where s.id = r.school_id;

create trigger fill_lesson_span before insert or update on public.scheduled_lessons
  for each row execute function private.fill_lesson_span();
create trigger fill_lesson_span before insert or update on public.registrations
  for each row execute function private.fill_lesson_span();

alter table public.scheduled_lessons alter column span_minutes set not null;
alter table public.registrations alter column span_minutes set not null;

-- Sluttid og "inden midnat" følger den samlede længde.
alter table public.scheduled_lessons drop constraint scheduled_lessons_check;
alter table public.registrations drop constraint registrations_check;
alter table public.scheduled_lessons drop column end_time;
alter table public.registrations drop column end_time;
alter table public.scheduled_lessons
  add column end_time time generated always as (start_time + make_interval(mins => span_minutes)) stored,
  add constraint scheduled_lessons_before_midnight check (extract(epoch from start_time) + span_minutes * 60 <= 86400);
alter table public.registrations
  add column end_time time generated always as (start_time + make_interval(mins => span_minutes)) stored,
  add constraint registrations_before_midnight check (extract(epoch from start_time) + span_minutes * 60 <= 86400);

-- Overlap og bookinger bruger den samlede længde.

create or replace function private.instructor_conflict(
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
                private.hhmm((upper(private.time_span(l.lesson_date, l.start_time, l.span_minutes)))::time))
    into v_text
  from public.scheduled_lessons l
  where l.instructor_id = p_instructor
    and l.id is distinct from p_ignore_lesson
    and l.lesson_date between lower(p_span)::date - 1 and upper(p_span)::date
    and private.time_span(l.lesson_date, l.start_time, l.span_minutes) && p_span
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

create or replace function private.guard_scheduled_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict text;
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, new.origin = 'office');
  -- Appens brugere kan kun vælge ydelser i brug (seed/server må lægge alt ind).
  if current_user = 'authenticated' and (
    tg_op = 'INSERT'
    or new.instructor_id is distinct from old.instructor_id
    or new.service_id is distinct from old.service_id
    or new.lesson_date is distinct from old.lesson_date) then
    perform private.check_service(new.school_id, new.instructor_id, new.service_id, new.lesson_date);
  end if;

  if tg_op = 'INSERT'
     or new.instructor_id is distinct from old.instructor_id
     or new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.span_minutes is distinct from old.span_minutes then
    perform private.lock_instructor(new.instructor_id);
    v_conflict := private.instructor_conflict(
      new.instructor_id,
      private.time_span(new.lesson_date, new.start_time, new.span_minutes),
      new.id, null
    );
    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_registration_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_other record;
  v_span tsrange;
begin
  if current_user = 'authenticated' then
    if tg_op <> 'INSERT' and private.date_is_locked(old.school_id, old.lesson_date) then
      raise exception 'Lønperioden er låst. Kontakt kontoret, hvis noget skal rettes.' using errcode = 'check_violation';
    end if;
    if tg_op <> 'DELETE' and private.date_is_locked(new.school_id, new.lesson_date) then
      raise exception 'Lønperioden er låst. Kontakt kontoret, hvis noget skal rettes.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Tydelig besked, før overlap-tjekket ville melde det samme på en mindre klar måde.
  if new.scheduled_lesson_id is not null
     and (tg_op = 'INSERT' or new.scheduled_lesson_id is distinct from old.scheduled_lesson_id)
     and exists (select 1 from public.registrations r where r.scheduled_lesson_id = new.scheduled_lesson_id and r.id <> new.id) then
    raise exception 'Lektionen er allerede registreret.' using errcode = 'unique_violation';
  end if;

  if new.status <> 'rejected' and (
       tg_op = 'INSERT'
       or new.instructor_id is distinct from old.instructor_id
       or new.lesson_date is distinct from old.lesson_date
       or new.start_time is distinct from old.start_time
       or new.span_minutes is distinct from old.span_minutes
       or old.status = 'rejected') then
    perform private.lock_instructor(new.instructor_id);
    v_span := private.time_span(new.lesson_date, new.start_time, new.span_minutes);
    select r.start_time, r.lesson_date, r.span_minutes into v_other
    from public.registrations r
    where r.instructor_id = new.instructor_id
      and r.id <> new.id
      and r.status <> 'rejected'
      and r.lesson_date between new.lesson_date - 1 and new.lesson_date + 1
      and private.time_span(r.lesson_date, r.start_time, r.span_minutes) && v_span
    order by r.start_time
    limit 1;
    if found then
      raise exception 'Du har allerede registreret en lektion kl. %–%.',
        private.hhmm(v_other.start_time),
        private.hhmm((upper(private.time_span(v_other.lesson_date, v_other.start_time, v_other.span_minutes)))::time)
        using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.follow_lesson_bookings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.lesson_count is distinct from old.lesson_count
     or new.span_minutes is distinct from old.span_minutes
     or new.instructor_id is distinct from old.instructor_id then
    update public.bookings
    set booking_date = new.lesson_date,
        start_time = new.start_time,
        minutes = new.span_minutes,
        instructor_id = new.instructor_id
    where scheduled_lesson_id = new.id;
  end if;
  return null;
end;
$$;

-- Bookinger, der hører til en lektion, får lektionens samlede længde.
update public.bookings b
set minutes = l.span_minutes
from public.scheduled_lessons l
where b.scheduled_lesson_id = l.id and b.minutes <> l.span_minutes;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
