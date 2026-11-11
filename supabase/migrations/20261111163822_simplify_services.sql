-- Ydelser forenklet (11. nov. 2026): en ydelse er kun navn, sats og Dataløn-løndel.
-- * Satsen (kr. pr. lektion med gyldig-fra-dato, tabellen service_prices) og løndelen sidder på ydelsen.
--   Flere ydelser må gerne have samme sats. Sats-grupperne (rate_groups) fjernes.
-- * Kategorier og typer fjernes overalt: på ydelser, lærere (kompetencer), lokaler, køretøjer og
--   lektioner. Alle aktive lærere kan alle aktive ydelser, og alle lokaler/køretøjer kan bookes.
-- * license_categories (kørekortkategorier) bliver stående som opslagstabel til elevdelen.

-- ---------------------------------------------------------------------------
-- 1. Løndelen flyttes fra sats-gruppen til ydelsen.
-- ---------------------------------------------------------------------------
alter table public.services
  add column payroll_code text check (char_length(payroll_code) <= 20);

update public.services s
set payroll_code = g.payroll_code
from public.rate_groups g
where g.id = s.rate_group_id;

-- ---------------------------------------------------------------------------
-- 2. Valg af ydelse: kun at ydelsen er i brug, og at læreren er aktiv på datoen.
-- ---------------------------------------------------------------------------
create function private.check_service(
  p_school uuid, p_instructor uuid, p_service uuid, p_date date
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.services s where s.id = p_service and s.school_id = p_school and s.active) then
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
end;
$$;

revoke all on function private.check_service(uuid, uuid, uuid, date) from public, anon;
grant execute on function private.check_service(uuid, uuid, uuid, date) to authenticated, service_role;

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

create or replace function private.guard_registration_service()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, false);
  if current_user = 'authenticated' and (
    tg_op = 'INSERT'
    or new.instructor_id is distinct from old.instructor_id
    or new.service_id is distinct from old.service_id) then
    perform private.check_service(new.school_id, new.instructor_id, new.service_id, new.lesson_date);
  end if;
  return new;
end;
$$;

create or replace function private.guard_registration_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean := tg_op = 'UPDATE' and (
    new.service_id is distinct from old.service_id
    or new.lesson_count is distinct from old.lesson_count
    or new.start_time is distinct from old.start_time
    or new.lesson_date is distinct from old.lesson_date
    or new.instructor_id is distinct from old.instructor_id);
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Låst pris.
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status <> 'approved'
       or new.service_id is distinct from old.service_id
       or new.instructor_id is distinct from old.instructor_id
       or new.lesson_date is distinct from old.lesson_date then
      new.locked_unit_price_ore := public.unit_price_on(new.instructor_id, new.service_id, new.lesson_date);
      if new.locked_unit_price_ore is null then
        raise exception 'Ydelsen har ingen pris på lektionens dato, så lektionen kan ikke godkendes.'
          using errcode = 'check_violation';
      end if;
    else
      new.locked_unit_price_ore := old.locked_unit_price_ore;
    end if;
  else
    new.locked_unit_price_ore := null;
  end if;

  -- Hvem og hvornår.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      new.decided_by := (select auth.uid());
      new.decided_at := now();
    else
      new.decided_by := null;
      new.decided_at := null;
    end if;
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;

  if new.status = 'rejected' and coalesce(btrim(new.decision_comment), '') = '' then
    raise exception 'Skriv en kommentar til læreren.' using errcode = 'check_violation';
  end if;

  -- Kontoret har rettet indholdet (læreren kan ikke sætte dette; se guard_registration).
  -- (En admin, der også underviser og retter sin egen lektion i lærer-appen, er ikke "kontoret".)
  if v_content_changed and private.is_staff(new.school_id)
     and new.instructor_id not in (select private.my_instructor_ids()) then
    new.office_edited_by := (select auth.uid());
    new.office_edited_at := now();
  end if;

  return new;
end;
$$;

drop function private.check_service_choice(uuid, uuid, uuid, text, date, boolean);

-- ---------------------------------------------------------------------------
-- 3. Kategorier og typer fjernes.
-- ---------------------------------------------------------------------------
alter table public.scheduled_lessons drop column category_code;
alter table public.registrations drop column category_code;

drop trigger guard_service_update on public.services;
drop function private.guard_service_update();
alter table public.services drop column rate_group_id;
alter table public.services drop column lesson_type_id;

drop table public.service_categories;
drop function private.guard_service_category_delete();
drop table public.instructor_categories;
drop table public.instructor_lesson_types;
drop table public.resource_categories;
drop table public.resource_lesson_types;
drop table public.rate_groups;

drop trigger add_default_lesson_types on public.schools;
drop function private.add_default_lesson_types();
drop table public.lesson_types;
