-- En booking af bil eller lokale med en underviser gør underviseren optaget (11. nov. 2026).
-- Før kunne underviseren planlægges til noget andet i samme tid. Nu tæller egne bookinger med i
-- private.instructor_conflict (lektioner, fravær og andre bookinger), og en ny booking må ikke ramme
-- underviserens lektioner, fravær, ferie eller andre bookinger. En lektions egen booking tæller ikke
-- for sig selv, for lektionen gør allerede underviseren optaget.

drop function private.instructor_conflict(uuid, tsrange, uuid, uuid);

create function private.instructor_conflict(
  p_instructor uuid, p_span tsrange, p_ignore_lesson uuid, p_ignore_absence uuid, p_ignore_booking uuid default null
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
  if v_text is not null then return v_text; end if;

  -- Egne bookinger af lokaler og biler (ikke dem, der hører til en lektion; lektionen tæller selv).
  select format('Læreren har booket %s kl. %s–%s.',
                coalesce(nullif(btrim(b.title), ''), r.name),
                private.hhmm(b.start_time),
                private.hhmm((upper(private.time_span(b.booking_date, b.start_time, b.minutes)))::time))
    into v_text
  from public.bookings b
  join public.resources r on r.id = b.resource_id
  where b.instructor_id = p_instructor
    and b.scheduled_lesson_id is null
    and b.id is distinct from p_ignore_booking
    and b.booking_date between lower(p_span)::date - 1 and upper(p_span)::date
    and private.time_span(b.booking_date, b.start_time, b.minutes) && p_span
  order by b.start_time
  limit 1;
  return v_text;
end;
$$;

create or replace function private.guard_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_other record;
  v_span tsrange;
  v_staff boolean;
  v_conflict text;
begin
  if current_user = 'authenticated' then
    v_staff := private.is_staff(coalesce(new.school_id, old.school_id));

    if tg_op = 'DELETE' then
      -- Bookingen slettes sammen med sin lektion (lektionen findes ikke længere): tilladt.
      if not v_staff and old.scheduled_lesson_id is not null
         and exists (select 1 from public.scheduled_lessons l where l.id = old.scheduled_lesson_id)
         and not private.own_planned_lesson(old.scheduled_lesson_id) then
        raise exception 'Bookingen hører til en lektion, kontoret har planlagt. Kontakt kontoret for at ændre den.'
          using errcode = 'insufficient_privilege';
      end if;
      return old;
    end if;

    if not v_staff then
      if new.instructor_id is null or new.instructor_id not in (select private.my_instructor_ids()) then
        raise exception 'Du kan kun booke til dig selv.' using errcode = 'insufficient_privilege';
      end if;
      if (new.scheduled_lesson_id is not null and not private.own_planned_lesson(new.scheduled_lesson_id))
         or (tg_op = 'UPDATE' and old.scheduled_lesson_id is not null and not private.own_planned_lesson(old.scheduled_lesson_id)) then
        raise exception 'Bookingen hører til en lektion, kontoret har planlagt. Kontakt kontoret for at ændre den.'
          using errcode = 'insufficient_privilege';
      end if;
      if new.booking_date < private.today_dk() then
        raise exception 'Du kan kun booke fra i dag og frem.' using errcode = 'check_violation';
      end if;
    end if;
  elsif tg_op = 'DELETE' then
    return old;
  end if;

  select r.name into v_name
  from public.resources r
  where r.id = new.resource_id and r.school_id = new.school_id and r.active;
  if v_name is null then
    raise exception 'Lokalet eller køretøjet er ikke i brug.' using errcode = 'check_violation';
  end if;

  -- En booking med en underviser (ikke en lektions booking) gør underviseren optaget: den må ikke
  -- ramme lektioner, fravær, ferie eller andre bookinger for samme underviser.
  if new.instructor_id is not null and new.scheduled_lesson_id is null and (
       tg_op = 'INSERT'
       or new.instructor_id is distinct from old.instructor_id
       or new.booking_date is distinct from old.booking_date
       or new.start_time is distinct from old.start_time
       or new.minutes is distinct from old.minutes
       or old.scheduled_lesson_id is not null) then
    perform private.lock_instructor(new.instructor_id);
    v_conflict := private.instructor_conflict(
      new.instructor_id, private.time_span(new.booking_date, new.start_time, new.minutes), null, null, new.id
    );
    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = 'exclusion_violation';
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.resource_id is distinct from old.resource_id
     or new.booking_date is distinct from old.booking_date
     or new.start_time is distinct from old.start_time
     or new.minutes is distinct from old.minutes then
    perform pg_advisory_xact_lock(hashtextextended('resource:' || new.resource_id::text, 0));
    v_span := private.time_span(new.booking_date, new.start_time, new.minutes);
    select b.booking_date, b.start_time, b.minutes into v_other
    from public.bookings b
    where b.resource_id = new.resource_id
      and b.id <> new.id
      and b.booking_date between new.booking_date - 1 and new.booking_date + 1
      and private.time_span(b.booking_date, b.start_time, b.minutes) && v_span
    order by b.start_time
    limit 1;
    if found then
      raise exception '% er optaget kl. %–%.', v_name, private.hhmm(v_other.start_time),
        private.hhmm((upper(private.time_span(v_other.booking_date, v_other.start_time, v_other.minutes)))::time)
        using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
