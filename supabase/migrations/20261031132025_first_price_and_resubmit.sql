-- Rettelser efter afprøvning på test.vixx.dk:
-- 1) En ydelses første pris gælder også bagud (som i prototypen). Før kunne lektioner fra før
--    prisens dato ikke godkendes, fx når en ny ydelse fik "gælder fra i dag".
-- 2) En admin, der også underviser, og som retter sin egen lektion i lærer-appen, markeres ikke
--    som "rettet af kontoret". ("Send igen" sætter status til afventer; det sker i appen.)

create or replace function public.service_price_on(p_service uuid, p_date date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.amount_ore from public.service_prices p
     where p.service_id = p_service and p.valid_from <= p_date
     order by p.valid_from desc limit 1),
    (select p.amount_ore from public.service_prices p
     where p.service_id = p_service
     order by p.valid_from asc limit 1)
  );
$$;

create or replace function private.guard_registration_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_content_changed boolean := tg_op = 'UPDATE' and (
    new.service_id is distinct from old.service_id
    or new.category_code is distinct from old.category_code
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

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
