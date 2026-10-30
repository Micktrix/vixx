-- Trin 1: RLS-politikker.
-- Roller pr. skole:
--   admin       alt, inkl. priser, ydelser, satser, typer og lønperioder
--   office      planlægning, godkendelser, fravær, ferie, ressourcer, undervisere (ikke priser)
--   instructor  egne data
-- "staff" = admin eller office.

-- ---------------------------------------------------------------------------
-- Hjælpefunktioner (i private, som ikke er eksponeret i API'et)
-- security definer, så de kan slå medlemskab op uden at ramme RLS rekursivt.
-- Alle tjekker altid den kaldende bruger via auth.uid().
-- ---------------------------------------------------------------------------
create function private.has_role(p_school uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_members m
    where m.school_id = p_school
      and m.user_id = (select auth.uid())
      and m.active
      and m.role = any (p_roles)
  );
$$;

create function private.is_member(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_school, array['admin', 'office', 'instructor']::public.app_role[]);
$$;

create function private.is_staff(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_school, array['admin', 'office']::public.app_role[]);
$$;

create function private.is_admin(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_school, array['admin']::public.app_role[]);
$$;

-- Den kaldende brugers lærer-id'er (én pr. skole med aktivt medlemskab).
create function private.my_instructor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
  from public.instructors i
  join public.school_members m on m.school_id = i.school_id and m.user_id = i.user_id
  where i.user_id = (select auth.uid())
    and m.active;
$$;

create function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_owners p where p.user_id = (select auth.uid()));
$$;

-- Er den kaldende bruger admin/office på en skole, hvor p_user er medlem?
create function private.is_staff_for_person(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_members target
    join public.school_members me on me.school_id = target.school_id
    where target.user_id = p_user
      and me.user_id = (select auth.uid())
      and me.active
      and me.role in ('admin', 'office')
  );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vagt-triggere: regler RLS ikke kan udtrykke (hvilke felter en lærer må ændre).
-- Gælder kun for appens brugere (rollen authenticated). Seed og server (service_role) er betroede.
-- ---------------------------------------------------------------------------

-- Registreringer: kun i dag eller tidligere. En lærer kan aldrig selv godkende, låse pris
-- eller sætte "rettet af kontoret"; en rettet registrering sendes altid til godkendelse igen.
create function private.guard_registration()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lesson_date > (now() at time zone 'Europe/Copenhagen')::date then
    raise exception 'En registrering kan kun laves for i dag eller tidligere.'
      using errcode = 'check_violation';
  end if;

  if current_user = 'authenticated' and not private.is_staff(new.school_id) then
    if tg_op = 'UPDATE' and old.status = 'approved' then
      raise exception 'En godkendt registrering kan kun rettes af kontoret.'
        using errcode = 'insufficient_privilege';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.locked_unit_price_ore := null;
    if tg_op = 'INSERT' then
      new.decision_comment := null;
      new.office_edited_by := null;
      new.office_edited_at := null;
    else
      new.office_edited_by := old.office_edited_by;
      new.office_edited_at := old.office_edited_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_registration before insert or update on public.registrations
  for each row execute function private.guard_registration();

-- Ferie: kun kontoret kan godkende/afvise.
create function private.guard_holiday()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.is_staff(new.school_id) then
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
  end if;
  return new;
end;
$$;

create trigger guard_holiday before insert or update on public.holidays
  for each row execute function private.guard_holiday();

-- Undervisere: læreren må kun rette egne kontakt- og pårørendeoplysninger.
create function private.guard_instructor_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := array[
    'email', 'address', 'postal_code', 'city',
    'next_of_kin_name', 'next_of_kin_relation', 'next_of_kin_phone', 'updated_at'
  ];
begin
  if current_user = 'authenticated' and not private.is_staff(new.school_id)
     and (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'Du kan kun rette dine kontakt- og pårørendeoplysninger.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_instructor_self_update before update on public.instructors
  for each row execute function private.guard_instructor_self_update();

-- ---------------------------------------------------------------------------
-- Fælles data
-- ---------------------------------------------------------------------------
create policy "Alle indloggede kan se kategorier" on public.license_categories
  for select to authenticated using (true);

create policy "Platform-ejer kan se sig selv" on public.platform_owners
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Profiler (én pr. person)
-- Oprettes af serveren (service_role) i trin 2.
-- ---------------------------------------------------------------------------
create policy "Se egen profil og profiler på egne skoler" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or private.is_staff_for_person(id)
    or (select private.is_platform_owner())
  );

create policy "Kontoret retter profiler på egne skoler" on public.profiles
  for update to authenticated
  using (private.is_staff_for_person(id))
  with check (private.is_staff_for_person(id));

-- ---------------------------------------------------------------------------
-- Skoler og medlemskaber
-- ---------------------------------------------------------------------------
create policy "Medlemmer ser egen skole" on public.schools
  for select to authenticated
  using (private.is_member(id) or (select private.is_platform_owner()));

create policy "Platform-ejer opretter skoler" on public.schools
  for insert to authenticated
  with check ((select private.is_platform_owner()));

create policy "Admin retter egen skole" on public.schools
  for update to authenticated
  using (private.is_admin(id) or (select private.is_platform_owner()))
  with check (private.is_admin(id) or (select private.is_platform_owner()));

create policy "Se egne medlemskaber og skolens" on public.school_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_staff(school_id)
    or (select private.is_platform_owner())
  );

-- Admin styrer alle roller; kontoret kun lærere.
create policy "Opret medlemskab" on public.school_members
  for insert to authenticated
  with check (
    private.is_admin(school_id)
    or (private.is_staff(school_id) and role = 'instructor')
    or (select private.is_platform_owner())
  );

create policy "Ret medlemskab" on public.school_members
  for update to authenticated
  using (
    private.is_admin(school_id)
    or (private.is_staff(school_id) and role = 'instructor')
    or (select private.is_platform_owner())
  )
  with check (
    private.is_admin(school_id)
    or (private.is_staff(school_id) and role = 'instructor')
    or (select private.is_platform_owner())
  );

create policy "Slet medlemskab" on public.school_members
  for delete to authenticated
  using (
    private.is_admin(school_id)
    or (private.is_staff(school_id) and role = 'instructor')
    or (select private.is_platform_owner())
  );

-- ---------------------------------------------------------------------------
-- Opsætning der kun admin må ændre, men alle på skolen må se:
-- typer, satser, ydelser og priser. Lønperioder og ressourcer følger samme mønster
-- (ressourcer må kontoret dog også ændre).
-- ---------------------------------------------------------------------------
create policy "Medlemmer ser typer" on public.lesson_types
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter typer" on public.lesson_types
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter typer" on public.lesson_types
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter typer" on public.lesson_types
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser satser" on public.rate_groups
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter satser" on public.rate_groups
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter satser" on public.rate_groups
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter satser" on public.rate_groups
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser ydelser" on public.services
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter ydelser" on public.services
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter ydelser" on public.services
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter ydelser" on public.services
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser priser" on public.service_prices
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter priser" on public.service_prices
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter priser" on public.service_prices
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter priser" on public.service_prices
  for delete to authenticated using (private.is_admin(school_id));

create policy "Kontoret og læreren selv ser egne priser" on public.instructor_prices
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Admin opretter lærerpriser" on public.instructor_prices
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter lærerpriser" on public.instructor_prices
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter lærerpriser" on public.instructor_prices
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser lønperioder" on public.pay_periods
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter lønperioder" on public.pay_periods
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter lønperioder" on public.pay_periods
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter lønperioder" on public.pay_periods
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser ressourcer" on public.resources
  for select to authenticated using (private.is_member(school_id));
create policy "Kontoret opretter ressourcer" on public.resources
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter ressourcer" on public.resources
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
create policy "Kontoret sletter ressourcer" on public.resources
  for delete to authenticated using (private.is_staff(school_id));

-- ---------------------------------------------------------------------------
-- Undervisere og kompetencer
-- ---------------------------------------------------------------------------
create policy "Kontoret ser skolens lærere, læreren sig selv" on public.instructors
  for select to authenticated
  using (private.is_staff(school_id) or id in (select private.my_instructor_ids()));
create policy "Kontoret opretter lærere" on public.instructors
  for insert to authenticated with check (private.is_staff(school_id));
-- Læreren må rette sig selv; guard_instructor_self_update begrænser felterne.
create policy "Kontoret og læreren selv retter" on public.instructors
  for update to authenticated
  using (private.is_staff(school_id) or id in (select private.my_instructor_ids()))
  with check (private.is_staff(school_id) or id in (select private.my_instructor_ids()));
create policy "Kontoret sletter lærere" on public.instructors
  for delete to authenticated using (private.is_staff(school_id));

create policy "Se kompetencer" on public.instructor_categories
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Kontoret opretter kompetencer" on public.instructor_categories
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret sletter kompetencer" on public.instructor_categories
  for delete to authenticated using (private.is_staff(school_id));

create policy "Se typekompetencer" on public.instructor_lesson_types
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Kontoret opretter typekompetencer" on public.instructor_lesson_types
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret sletter typekompetencer" on public.instructor_lesson_types
  for delete to authenticated using (private.is_staff(school_id));

-- ---------------------------------------------------------------------------
-- Planlagte lektioner
-- Læreren ser egne og må oprette/rette/slette dem, de selv har lagt ind.
-- ---------------------------------------------------------------------------
create policy "Se planlagte lektioner" on public.scheduled_lessons
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Opret planlagt lektion" on public.scheduled_lessons
  for insert to authenticated
  with check (
    private.is_staff(school_id)
    or (origin = 'instructor' and instructor_id in (select private.my_instructor_ids()))
  );
create policy "Ret planlagt lektion" on public.scheduled_lessons
  for update to authenticated
  using (
    private.is_staff(school_id)
    or (origin = 'instructor' and instructor_id in (select private.my_instructor_ids()))
  )
  with check (
    private.is_staff(school_id)
    or (origin = 'instructor' and instructor_id in (select private.my_instructor_ids()))
  );
create policy "Slet planlagt lektion" on public.scheduled_lessons
  for delete to authenticated
  using (
    private.is_staff(school_id)
    or (origin = 'instructor' and instructor_id in (select private.my_instructor_ids()))
  );

-- ---------------------------------------------------------------------------
-- Registreringer
-- Læreren opretter egne og retter dem, der afventer eller er afvist (guard_registration
-- sørger for, at de altid står som "afventer"). Kun kontoret godkender og sletter.
-- ---------------------------------------------------------------------------
create policy "Se registreringer" on public.registrations
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Opret registrering" on public.registrations
  for insert to authenticated
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Ret registrering" on public.registrations
  for update to authenticated
  using (
    private.is_staff(school_id)
    or (instructor_id in (select private.my_instructor_ids()) and status in ('pending', 'rejected'))
  )
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Slet registrering" on public.registrations
  for delete to authenticated
  using (
    private.is_staff(school_id)
    or (instructor_id in (select private.my_instructor_ids()) and status = 'pending')
  );

-- ---------------------------------------------------------------------------
-- Fravær (kun kontoret ændrer), ferie og "Kan arbejde"
-- ---------------------------------------------------------------------------
create policy "Se fravær" on public.absences
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Kontoret opretter fravær" on public.absences
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter fravær" on public.absences
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
create policy "Kontoret sletter fravær" on public.absences
  for delete to authenticated using (private.is_staff(school_id));

create policy "Se ferie" on public.holidays
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Opret ferieanmodning" on public.holidays
  for insert to authenticated
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Ret ferie" on public.holidays
  for update to authenticated
  using (
    private.is_staff(school_id)
    or (instructor_id in (select private.my_instructor_ids()) and status = 'pending')
  )
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Slet ferie" on public.holidays
  for delete to authenticated
  using (
    private.is_staff(school_id)
    or (instructor_id in (select private.my_instructor_ids()) and status = 'pending')
  );

create policy "Se kan-arbejde" on public.availability
  for select to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Opret kan-arbejde" on public.availability
  for insert to authenticated
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Ret kan-arbejde" on public.availability
  for update to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()))
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Slet kan-arbejde" on public.availability
  for delete to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));

-- ---------------------------------------------------------------------------
-- Bookinger af lokaler og køretøjer
-- Alle på skolen ser bookinger (for at se hvad der er ledigt). Lærere retter kun egne.
-- ---------------------------------------------------------------------------
create policy "Medlemmer ser bookinger" on public.bookings
  for select to authenticated using (private.is_member(school_id));
create policy "Opret booking" on public.bookings
  for insert to authenticated
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Ret booking" on public.bookings
  for update to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()))
  with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Slet booking" on public.bookings
  for delete to authenticated
  using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));

-- ---------------------------------------------------------------------------
-- Beskeder
-- ---------------------------------------------------------------------------
create policy "Se beskeder" on public.messages
  for select to authenticated
  using (
    private.is_staff(school_id)
    or (
      private.is_member(school_id)
      and (recipient_instructor_id is null or recipient_instructor_id in (select private.my_instructor_ids()))
    )
  );
create policy "Kontoret sender beskeder" on public.messages
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret retter beskeder" on public.messages
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
create policy "Kontoret sletter beskeder" on public.messages
  for delete to authenticated using (private.is_staff(school_id));

create policy "Se læst-markeringer" on public.message_reads
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff(school_id));
create policy "Markér egne beskeder som læst" on public.message_reads
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(school_id));
create policy "Fjern egne læst-markeringer" on public.message_reads
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Ændringslog: kun læsning for kontoret. Skrives af triggere (næste migration).
-- ---------------------------------------------------------------------------
create policy "Kontoret ser skolens ændringslog" on public.audit_log
  for select to authenticated using (private.is_staff(school_id));
