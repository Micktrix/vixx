-- Trin 4: ydelser, satser og priser.
-- Prisberegning (CLAUDE.md): låst pris hvis godkendt → lærerens egen pris → ydelsens pris
-- gældende på lektionens dato. Funktionerne kører som den kaldende bruger, så RLS gælder.

-- Ydelsens pris på en dato: den seneste pris med gyldig-fra på eller før datoen.
create function public.service_price_on(p_service uuid, p_date date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select p.amount_ore
  from public.service_prices p
  where p.service_id = p_service
    and p.valid_from <= p_date
  order by p.valid_from desc
  limit 1;
$$;

-- Pris pr. lektion for en lærer på en dato (uden låst pris).
create function public.unit_price_on(p_instructor uuid, p_service uuid, p_date date)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select ip.amount_ore from public.instructor_prices ip
     where ip.instructor_id = p_instructor and ip.service_id = p_service),
    public.service_price_on(p_service, p_date)
  );
$$;

-- Pris pr. lektion for en registrering. Kan hentes som beregnet felt: registrations?select=*,unit_price_ore
create function public.unit_price_ore(r public.registrations)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(r.locked_unit_price_ore, public.unit_price_on(r.instructor_id, r.service_id, r.lesson_date));
$$;

revoke all on function public.service_price_on(uuid, date) from public, anon;
revoke all on function public.unit_price_on(uuid, uuid, date) from public, anon;
revoke all on function public.unit_price_ore(public.registrations) from public, anon;
grant execute on function public.service_price_on(uuid, date) to authenticated, service_role;
grant execute on function public.unit_price_on(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.unit_price_ore(public.registrations) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- En brugt ydelse beholder sin kategori og type, så gamle lektioner ikke skifter betydning.
-- (Sletning af brugte ydelser og satser forhindres allerede af fremmednøglerne.)
-- ---------------------------------------------------------------------------
create function private.service_is_used(p_service uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.scheduled_lessons where service_id = p_service)
      or exists (select 1 from public.registrations where service_id = p_service);
$$;

revoke all on function private.service_is_used(uuid) from public, anon;
grant execute on function private.service_is_used(uuid) to authenticated, service_role;

create function private.guard_service_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.category_code is distinct from old.category_code or new.lesson_type_id is distinct from old.lesson_type_id)
     and private.service_is_used(old.id) then
    raise exception 'Ydelsen er brugt på lektioner, så kategori og type kan ikke ændres. Opret en ny ydelse og slå denne fra.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_service_update before update on public.services
  for each row execute function private.guard_service_update();

-- En ydelse skal altid have mindst én pris.
create function private.guard_last_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.services s where s.id = old.service_id)
     and not exists (select 1 from public.service_prices p where p.service_id = old.service_id and p.id <> old.id) then
    raise exception 'En ydelse skal have mindst én pris.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger guard_last_price before delete on public.service_prices
  for each row execute function private.guard_last_price();

-- Antal lektioner (planlagte + registrerede) pr. ydelse på en skole, til oversigten.
-- Kører som den kaldende bruger, så kun det, brugeren må se, tælles.
create function public.service_usage(p_school uuid)
returns table (service_id uuid, uses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.service_id, count(*)
  from (
    select l.service_id from public.scheduled_lessons l where l.school_id = p_school
    union all
    select r.service_id from public.registrations r where r.school_id = p_school
  ) u
  group by u.service_id;
$$;

revoke all on function public.service_usage(uuid) from public, anon;
grant execute on function public.service_usage(uuid) to authenticated, service_role;
