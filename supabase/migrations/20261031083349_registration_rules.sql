-- Trin 6: regler for registreringer fra lærer-appen.
-- 1) En planlagt lektion kan kun registreres som "Udført" én gang.
-- 2) En lærers registreringer (ikke afviste) kan ikke overlappe hinanden.
-- 3) Låst lønperiode: registreringer med dato i perioden kan ikke oprettes, rettes eller slettes.
--    Gælder appens brugere; kun admin kan låse op (trin 8).

create unique index registrations_scheduled_lesson_once on public.registrations (scheduled_lesson_id)
  where scheduled_lesson_id is not null;

create function private.date_is_locked(p_school uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pay_periods p
    where p.school_id = p_school and p.locked and p_date between p.starts_on and p.ends_on
  );
$$;

create function private.guard_registration_time()
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
       or new.lesson_count is distinct from old.lesson_count
       or old.status = 'rejected') then
    perform private.lock_instructor(new.instructor_id);
    v_span := private.time_span(new.lesson_date, new.start_time, new.lesson_count * new.lesson_minutes);
    select r.start_time, r.lesson_date, r.lesson_count, r.lesson_minutes into v_other
    from public.registrations r
    where r.instructor_id = new.instructor_id
      and r.id <> new.id
      and r.status <> 'rejected'
      and r.lesson_date between new.lesson_date - 1 and new.lesson_date + 1
      and private.time_span(r.lesson_date, r.start_time, r.lesson_count * r.lesson_minutes) && v_span
    order by r.start_time
    limit 1;
    if found then
      raise exception 'Du har allerede registreret en lektion kl. %–%.',
        private.hhmm(v_other.start_time),
        private.hhmm((upper(private.time_span(v_other.lesson_date, v_other.start_time, v_other.lesson_count * v_other.lesson_minutes)))::time)
        using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Sorterer efter fill_lesson_minutes, guard_registration og guard_registration_service.
create trigger guard_registration_time before insert or update or delete on public.registrations
  for each row execute function private.guard_registration_time();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
