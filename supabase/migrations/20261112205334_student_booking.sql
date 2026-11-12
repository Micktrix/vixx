-- Elevdelen, trin E5 (12. nov. 2026): elevens kalender og anmodning om kørelektioner.
-- - Kontoret kobler eleven på én eller flere faste lærere og kan give eleven lov til selv at anmode om
--   kørelektioner (pr. elev, uanset hold).
-- - Læreren åbner tider. Eleven anmoder om en åben tid hos sine faste lærere; læreren godkender (= planlagt
--   lektion med eleven) eller afviser. Eleven kan melde afbud indtil skolens frist.
-- - Alle elever har en kalender (også som abonnement i telefonen) med deres lektioner.
-- Eleven læser og handler via funktionerne nederst, så eleven aldrig ser lærernes skema eller andre elever.

alter table public.schools
  add column contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),       -- vises i elevens app
  add column cancel_hours int not null default 24 check (cancel_hours between 0 and 168); -- frist for afbud

alter table public.students
  add column can_request boolean not null default false,          -- må selv anmode om kørelektioner
  add column calendar_token uuid not null default gen_random_uuid();
create unique index students_calendar_token_idx on public.students (calendar_token);

-- Elevens faste lærere.
create table public.student_instructors (
  school_id uuid not null,
  student_id uuid not null,
  instructor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (student_id, instructor_id),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade
);
create index student_instructors_school_idx on public.student_instructors (school_id);
create index student_instructors_instructor_idx on public.student_instructors (instructor_id);

-- Tider, læreren har åbnet for elevernes anmodninger. En åben tid gør ikke læreren optaget.
create table public.open_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  instructor_id uuid not null,
  slot_date date not null,
  start_time time not null,
  lesson_count int not null check (lesson_count between 1 and 12),
  lesson_minutes int not null default 45,
  span_minutes int,                                  -- hele blokken efter lektionsplanen (fill_lesson_span)
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id) on delete cascade,
  unique (school_id, id)
);
create index open_slots_school_date_idx on public.open_slots (school_id, slot_date);
create index open_slots_instructor_date_idx on public.open_slots (instructor_id, slot_date);

create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  slot_id uuid not null,
  student_id uuid not null,
  status public.request_status not null default 'pending',
  scheduled_lesson_id uuid,                          -- den planlagte lektion, når læreren godkender
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (school_id, slot_id) references public.open_slots (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade,
  foreign key (school_id, scheduled_lesson_id) references public.scheduled_lessons (school_id, id) on delete set null (scheduled_lesson_id)
);
-- Én aktiv anmodning pr. åben tid.
create unique index lesson_requests_one_active on public.lesson_requests (slot_id) where status in ('pending', 'approved');
create index lesson_requests_school_idx on public.lesson_requests (school_id);
create index lesson_requests_student_idx on public.lesson_requests (student_id);
create index lesson_requests_lesson_idx on public.lesson_requests (scheduled_lesson_id);

-- Tidspunktet for en dato og tid i dansk tid.
create function private.dk_moment(p_date date, p_time time)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (p_date + p_time) at time zone 'Europe/Copenhagen';
$$;

-- ---------------------------------------------------------------------------
-- Regler for åbne tider
-- ---------------------------------------------------------------------------

-- Lektionslængden kommer fra skolen (før fill_lesson_span regner blokken ud).
create function private.default_slot_minutes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.lesson_minutes := coalesce((select s.lesson_minutes from public.schools s where s.id = new.school_id), new.lesson_minutes);
  return new;
end;
$$;

create function private.guard_open_slot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conflict text;
  v_span tsrange;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.lesson_requests r where r.slot_id = old.id and r.status in ('pending', 'approved')) then
      raise exception 'Tiden er anmodet eller booket af en elev og kan ikke fjernes.' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'En åben tid kan ikke rettes. Fjern den og åbn en ny.' using errcode = 'check_violation';
  end if;

  perform private.require_planning_access(new.school_id, new.instructor_id, false);
  if current_user = 'authenticated' and private.dk_moment(new.slot_date, new.start_time) <= now() then
    raise exception 'En åben tid skal ligge frem i tiden.' using errcode = 'check_violation';
  end if;

  perform private.lock_instructor(new.instructor_id);
  v_span := private.time_span(new.slot_date, new.start_time, new.span_minutes);
  v_conflict := private.instructor_conflict(new.instructor_id, v_span, null, null);
  if v_conflict is not null then
    raise exception '%', v_conflict using errcode = 'exclusion_violation';
  end if;
  if exists (
    select 1 from public.open_slots o
    where o.instructor_id = new.instructor_id and o.id <> new.id and o.slot_date between new.slot_date - 1 and new.slot_date + 1
      and private.time_span(o.slot_date, o.start_time, o.span_minutes) && v_span
  ) then
    raise exception 'Du har allerede en åben tid i det tidsrum.' using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;

create trigger default_slot_minutes before insert on public.open_slots
  for each row execute function private.default_slot_minutes();
create trigger fill_lesson_span before insert or update on public.open_slots
  for each row execute function private.fill_lesson_span();
create trigger guard_open_slot before insert or update or delete on public.open_slots
  for each row execute function private.guard_open_slot();

-- ---------------------------------------------------------------------------
-- Regler for anmodninger: læreren for den åbne tid godkender eller afviser. Eleven anmoder og melder
-- afbud via funktionerne nederst.
-- ---------------------------------------------------------------------------
create function private.guard_lesson_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_instructor uuid;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.school_id, new.slot_id, new.student_id, new.created_at) is distinct from (old.school_id, old.slot_id, old.student_id, old.created_at) then
    raise exception 'En anmodning kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  select o.instructor_id into v_instructor from public.open_slots o where o.id = old.slot_id;
  if v_instructor is null or v_instructor not in (select private.my_instructor_ids()) then
    raise exception 'Kun læreren kan svare på anmodningen.' using errcode = 'insufficient_privilege';
  end if;
  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Anmodningen er allerede besvaret.' using errcode = 'check_violation';
  end if;
  if new.status = 'approved' and not exists (
    select 1 from public.scheduled_lessons l
    where l.id = new.scheduled_lesson_id and l.instructor_id = v_instructor and l.student_id = old.student_id
  ) then
    raise exception 'Den godkendte anmodning skal have en planlagt lektion med eleven.' using errcode = 'check_violation';
  end if;
  if new.status = 'rejected' then
    new.scheduled_lesson_id := null;
  end if;
  new.decided_by := (select auth.uid());
  new.decided_at := now();
  return new;
end;
$$;

create trigger guard_lesson_request before update on public.lesson_requests
  for each row execute function private.guard_lesson_request();

-- ---------------------------------------------------------------------------
-- Adgang
-- ---------------------------------------------------------------------------
alter table public.student_instructors enable row level security;
alter table public.open_slots enable row level security;
alter table public.lesson_requests enable row level security;
revoke all on public.student_instructors, public.open_slots, public.lesson_requests from anon, authenticated;
grant select, insert, delete on public.student_instructors to authenticated;
grant select, insert, delete on public.open_slots to authenticated;
grant select, update on public.lesson_requests to authenticated;
grant all on public.student_instructors, public.open_slots, public.lesson_requests to service_role;

create policy "Skolen ser faste lærere, eleven sine egne" on public.student_instructors
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Kontoret kobler lærere på elever" on public.student_instructors
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret fjerner faste lærere" on public.student_instructors
  for delete to authenticated using (private.is_staff(school_id));

create policy "Kontoret og læreren ser åbne tider" on public.open_slots
  for select to authenticated using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Læreren åbner tider" on public.open_slots
  for insert to authenticated with check (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));
create policy "Læreren fjerner åbne tider" on public.open_slots
  for delete to authenticated using (private.is_staff(school_id) or instructor_id in (select private.my_instructor_ids()));

create policy "Kontoret, læreren og eleven ser anmodninger" on public.lesson_requests
  for select to authenticated using (
    private.is_staff(school_id)
    or exists (select 1 from public.open_slots o where o.id = slot_id and o.instructor_id in (select private.my_instructor_ids()))
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Læreren svarer på anmodninger" on public.lesson_requests
  for update to authenticated
  using (exists (select 1 from public.open_slots o where o.id = slot_id and o.instructor_id in (select private.my_instructor_ids())))
  with check (exists (select 1 from public.open_slots o where o.id = slot_id and o.instructor_id in (select private.my_instructor_ids())));

create trigger write_audit after insert or update or delete on public.student_instructors
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.open_slots
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.lesson_requests
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Elevens funktioner. Kører som ejer, men kun for den indloggede elev på den valgte skole.
-- ---------------------------------------------------------------------------

-- Den indloggede elev på skolen (aktiv), ellers null.
create function private.my_student(p_school uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.students s where s.school_id = p_school and s.user_id = (select auth.uid()) and s.active;
$$;

-- Åbne tider hos elevens faste lærere, der ikke er taget, og som ligger frem i tiden. Kun for elever med lov.
create function public.student_open_slots(p_school uuid)
returns table (id uuid, slot_date date, start_time time, span_minutes int, lesson_count int, instructor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.slot_date, o.start_time, o.span_minutes, o.lesson_count, p.full_name
  from public.students s
  join public.student_instructors si on si.student_id = s.id
  join public.open_slots o on o.instructor_id = si.instructor_id
  join public.instructors i on i.id = o.instructor_id
  join public.profiles p on p.id = i.user_id
  where s.id = private.my_student(p_school) and s.can_request
    and private.dk_moment(o.slot_date, o.start_time) > now()
    and not exists (select 1 from public.lesson_requests r where r.slot_id = o.id and r.status in ('pending', 'approved'))
  order by o.slot_date, o.start_time;
$$;

create function public.request_open_slot(p_school uuid, p_slot uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := private.my_student(p_school);
  v_id uuid;
begin
  if v_student is null or not exists (select 1 from public.students s where s.id = v_student and s.can_request) then
    raise exception 'Du kan ikke selv anmode om kørelektioner. Kontakt kontoret.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.open_slots o
    join public.student_instructors si on si.instructor_id = o.instructor_id and si.student_id = v_student
    where o.id = p_slot and o.school_id = p_school and private.dk_moment(o.slot_date, o.start_time) > now()
  ) then
    raise exception 'Tiden findes ikke længere.' using errcode = 'check_violation';
  end if;
  insert into public.lesson_requests (school_id, slot_id, student_id) values (p_school, p_slot, v_student) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Tiden er lige blevet taget af en anden elev.' using errcode = 'unique_violation';
end;
$$;

-- Træk en anmodning tilbage, eller meld afbud på en booket lektion inden skolens frist.
create function public.cancel_lesson_request(p_school uuid, p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.lesson_requests;
  v_start timestamptz;
  v_hours int;
begin
  select r.* into v_request from public.lesson_requests r
  where r.id = p_request and r.school_id = p_school and r.student_id = private.my_student(p_school);
  if v_request.id is null or v_request.status not in ('pending', 'approved') then
    raise exception 'Anmodningen findes ikke.' using errcode = 'check_violation';
  end if;
  if v_request.status = 'approved' then
    select private.dk_moment(o.slot_date, o.start_time), s.cancel_hours into v_start, v_hours
    from public.open_slots o join public.schools s on s.id = o.school_id where o.id = v_request.slot_id;
    if v_start - make_interval(hours => v_hours) < now() then
      raise exception 'Fristen for afbud er overskredet. Kontakt kontoret.' using errcode = 'check_violation';
    end if;
    delete from public.scheduled_lessons where id = v_request.scheduled_lesson_id;
  end if;
  update public.lesson_requests set status = 'cancelled', decided_at = now(), decided_by = (select auth.uid()) where id = p_request;
end;
$$;

-- Elevens lektioner: planlagte lektioner med eleven (også dem, kontoret har lagt ind) og anmodninger.
create function public.student_lessons(p_school uuid)
returns table (
  kind text, id uuid, lesson_date date, start_time time, span_minutes int, lesson_count int,
  instructor_name text, service_name text, status public.request_status, cancel_before timestamptz, request_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'lesson', l.id, l.lesson_date, l.start_time, l.span_minutes, l.lesson_count, p.full_name, sv.name,
         r.status, case when r.id is not null then private.dk_moment(l.lesson_date, l.start_time) - make_interval(hours => sc.cancel_hours) end,
         r.id
  from public.scheduled_lessons l
  join public.instructors i on i.id = l.instructor_id
  join public.profiles p on p.id = i.user_id
  join public.services sv on sv.id = l.service_id
  join public.schools sc on sc.id = l.school_id
  left join public.lesson_requests r on r.scheduled_lesson_id = l.id and r.status = 'approved'
  where l.student_id = private.my_student(p_school) and l.school_id = p_school
  union all
  select 'request', r.id, o.slot_date, o.start_time, o.span_minutes, o.lesson_count, p.full_name, null, r.status, null, r.id
  from public.lesson_requests r
  join public.open_slots o on o.id = r.slot_id
  join public.instructors i on i.id = o.instructor_id
  join public.profiles p on p.id = i.user_id
  where r.student_id = private.my_student(p_school) and r.school_id = p_school
    and (r.status = 'pending' or (r.status = 'rejected' and o.slot_date >= private.today_dk() - 7))
  order by 3, 4;
$$;

-- Kontakt: skolens telefon og elevens faste lærere.
create function public.student_contacts(p_school uuid)
returns table (name text, phone text, is_school boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.contact_phone, true from public.schools s
  where s.id = p_school and private.my_student(p_school) is not null
  union all
  select p.full_name, p.phone, false
  from public.student_instructors si
  join public.instructors i on i.id = si.instructor_id
  join public.profiles p on p.id = i.user_id
  where si.student_id = private.my_student(p_school)
  order by 3 desc, 1;
$$;

revoke all on function public.student_open_slots(uuid), public.request_open_slot(uuid, uuid),
  public.cancel_lesson_request(uuid, uuid), public.student_lessons(uuid), public.student_contacts(uuid) from public, anon;
grant execute on function public.student_open_slots(uuid), public.request_open_slot(uuid, uuid),
  public.cancel_lesson_request(uuid, uuid), public.student_lessons(uuid), public.student_contacts(uuid) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
