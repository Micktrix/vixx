-- Trin 11: booking af lokaler og køretøjer.
-- * Et lokale/køretøj kan ikke være booket to gange samtidig (lås pr. ressource).
-- * Lærere booker frit for sig selv (fra i dag og frem) og retter/sletter kun egne bookinger.
--   En booking, der hører til en lektion, følger lektionen og kan kun ændres af kontoret.
-- * Flyttes en lektion, flytter dens booking med; slettes lektionen, slettes bookingen (fremmednøgle).

create function private.guard_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_other record;
  v_span tsrange;
  v_staff boolean;
begin
  if current_user = 'authenticated' then
    v_staff := private.is_staff(coalesce(new.school_id, old.school_id));

    if tg_op = 'DELETE' then
      -- Bookingen slettes sammen med sin lektion (lektionen findes ikke længere): tilladt.
      if not v_staff and old.scheduled_lesson_id is not null
         and exists (select 1 from public.scheduled_lessons l where l.id = old.scheduled_lesson_id) then
        raise exception 'Bookingen hører til en lektion og følger den. Kontakt kontoret for at ændre den.'
          using errcode = 'insufficient_privilege';
      end if;
      return old;
    end if;

    if not v_staff then
      if new.instructor_id is null or new.instructor_id not in (select private.my_instructor_ids()) then
        raise exception 'Du kan kun booke til dig selv.' using errcode = 'insufficient_privilege';
      end if;
      if new.scheduled_lesson_id is not null or (tg_op = 'UPDATE' and old.scheduled_lesson_id is not null) then
        raise exception 'Bookingen hører til en lektion og følger den. Kontakt kontoret for at ændre den.'
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

create trigger guard_booking before insert or update or delete on public.bookings
  for each row execute function private.guard_booking();

-- Bookingen følger lektionen: dato, tid, længde og lærer. Kører som ejer, så lærerens egne
-- lektioner kan flyttes, selvom læreren ikke selv må ændre en lektions-booking.
-- Er ressourcen optaget på det nye tidspunkt, afvises flytningen af lektionen.
create function private.follow_lesson_bookings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.lesson_count is distinct from old.lesson_count
     or new.lesson_minutes is distinct from old.lesson_minutes
     or new.instructor_id is distinct from old.instructor_id then
    update public.bookings
    set booking_date = new.lesson_date,
        start_time = new.start_time,
        minutes = new.lesson_count * new.lesson_minutes,
        instructor_id = new.instructor_id
    where scheduled_lesson_id = new.id;
  end if;
  return null;
end;
$$;

create trigger follow_lesson_bookings after update on public.scheduled_lessons
  for each row execute function private.follow_lesson_bookings();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
