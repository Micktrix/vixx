-- Trin 8: lås af lønperioder.
-- Kontoret og admin kan oprette og låse en periode. Kun admin kan låse op (logges i ændringsloggen).
-- Kontoret kan ikke ændre en periodes datoer; hvem og hvornår der låste, sættes af databasen.

drop policy "Admin opretter lønperioder" on public.pay_periods;
drop policy "Admin retter lønperioder" on public.pay_periods;

create policy "Kontoret opretter lønperioder" on public.pay_periods
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter lønperioder" on public.pay_periods
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));

create function private.guard_pay_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.locked and not new.locked and not private.is_admin(new.school_id) then
      raise exception 'Kun admin kan låse en lønperiode op.' using errcode = 'insufficient_privilege';
    end if;
    if (new.starts_on <> old.starts_on or new.ends_on <> old.ends_on) and not private.is_admin(new.school_id) then
      raise exception 'Kun admin kan ændre en lønperiodes datoer.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.locked and (tg_op = 'INSERT' or not old.locked) then
    new.locked_by := (select auth.uid());
    new.locked_at := now();
  elsif not new.locked then
    new.locked_by := null;
    new.locked_at := null;
  else
    new.locked_by := old.locked_by;
    new.locked_at := old.locked_at;
  end if;
  return new;
end;
$$;

create trigger guard_pay_period before insert or update on public.pay_periods
  for each row execute function private.guard_pay_period();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
