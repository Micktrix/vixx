-- Trin 7: godkendelser.
-- For appens brugere bestemmer databasen selv:
-- * Prisen låses ved godkendelse: lærerens egen pris → ydelsens pris på lektionens dato.
--   Klienten kan ikke sende en pris, og senere prisændringer rører den ikke.
--   Rettes ydelse, lærer eller dato på en godkendt registrering, låses prisen igen.
-- * Hvem og hvornår der godkendte/afviste, og hvem der rettede (kontoret).
-- * En afvisning kræver en kommentar til læreren.

create function private.guard_registration_decision()
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
  if v_content_changed and private.is_staff(new.school_id) then
    new.office_edited_by := (select auth.uid());
    new.office_edited_at := now();
  end if;

  return new;
end;
$$;

-- Sorterer efter guard_registration (som tvinger lærerens egne til "afventer").
create trigger guard_registration_decision before insert or update on public.registrations
  for each row execute function private.guard_registration_decision();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
