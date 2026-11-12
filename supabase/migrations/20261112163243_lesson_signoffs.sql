-- Elevdelen, trin E3: QR-kvittering (12. nov. 2026).
-- Eleven viser en QR-kode (et link med elevens hemmelige nøgle). Læreren scanner og kvitterer for en lektion
-- i forløbet (kørelærerens underskrift), og eleven bekræfter (elevens underskrift). En kvittering kan aldrig
-- slettes. Kørselslektioner kan registreres til lønnen i samme tryk; registreringen kobles på kvitteringen.

alter table public.students
  add column qr_token uuid not null default gen_random_uuid();
create unique index students_qr_token_idx on public.students (qr_token);

create table public.lesson_signoffs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  course_lesson_id uuid not null references public.course_lessons (id),   -- en brugt lektion kan ikke slettes
  lesson_number text not null,                                           -- som lektionen hed, da der blev kvitteret
  instructor_id uuid not null,
  signed_by uuid not null default auth.uid() references auth.users (id),
  instructor_name text not null default '',                              -- lærerens navn, så eleven kan se det
  signed_at timestamptz not null default now(),
  lesson_date date not null default private.today_dk(),
  skipped_items text check (char_length(skipped_items) <= 2000),      -- punkter, der ikke blev nået (én pr. linje)
  registration_id uuid references public.registrations (id) on delete set null,
  confirmed_at timestamptz,                                              -- elevens bekræftelse
  foreign key (school_id, student_id) references public.students (school_id, id),
  foreign key (school_id, instructor_id) references public.instructors (school_id, id),
  unique (student_id, course_lesson_id)
);
create index lesson_signoffs_school_idx on public.lesson_signoffs (school_id);
create index lesson_signoffs_instructor_idx on public.lesson_signoffs (instructor_id);
create index lesson_signoffs_lesson_idx on public.lesson_signoffs (course_lesson_id);
create index lesson_signoffs_registration_idx on public.lesson_signoffs (registration_id);

-- Regler for appens brugere: læreren kvitterer kun som sig selv og kun for en lektion i elevens eget
-- forløb. Bagefter må kun eleven ændre noget, og kun bekræftelsen (fra tom til nu). Registreringen kan
-- kobles på af læreren, der kvitterede.
create function private.guard_lesson_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.instructor_id not in (select private.my_instructor_ids()) then
      raise exception 'Du kan kun kvittere som dig selv.' using errcode = 'insufficient_privilege';
    end if;
    select l.number into v_number
    from private.student_course_lesson(new.student_id, new.course_lesson_id, new.school_id) l;
    if v_number is null then
      raise exception 'Lektionen hører ikke til elevens forløb.' using errcode = 'check_violation';
    end if;
    new.lesson_number := v_number;
    new.signed_by := (select auth.uid());
    new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
    new.signed_at := now();
    new.lesson_date := private.today_dk();
    new.confirmed_at := null;
    return new;
  end if;

  -- UPDATE: kun bekræftelsen (eleven) eller registreringen (læreren, der kvitterede).
  if (new.school_id, new.student_id, new.course_lesson_id, new.lesson_number, new.instructor_id, new.signed_by,
      new.instructor_name, new.signed_at, new.lesson_date, new.skipped_items)
     is distinct from
     (old.school_id, old.student_id, old.course_lesson_id, old.lesson_number, old.instructor_id, old.signed_by,
      old.instructor_name, old.signed_at, old.lesson_date, old.skipped_items) then
    raise exception 'En kvittering kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  if new.confirmed_at is distinct from old.confirmed_at then
    if old.confirmed_at is not null or not exists (
      select 1 from public.students s where s.id = new.student_id and s.user_id = (select auth.uid())
    ) then
      raise exception 'Kun eleven kan bekræfte lektionen, og kun én gang.' using errcode = 'insufficient_privilege';
    end if;
    new.confirmed_at := now();
  end if;
  if new.registration_id is distinct from old.registration_id and old.signed_by <> (select auth.uid()) then
    raise exception 'Kun læreren, der kvitterede, kan koble timen på.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Lektionen i elevens forløb (eller ingenting). Kører som ejer, så læreren ikke behøver at kunne se mere.
create function private.student_course_lesson(p_student uuid, p_lesson uuid, p_school uuid)
returns table (number text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.number
  from public.students s
  join public.course_lessons l on l.course_id = s.course_id and l.id = p_lesson and l.active
  where s.id = p_student and s.school_id = p_school and s.active;
$$;

create trigger guard_lesson_signoff before insert or update on public.lesson_signoffs
  for each row execute function private.guard_lesson_signoff();

alter table public.lesson_signoffs enable row level security;
revoke all on public.lesson_signoffs from anon, authenticated;
grant select, insert, update on public.lesson_signoffs to authenticated;
grant all on public.lesson_signoffs to service_role;

create policy "Skolen ser kvitteringer, eleven sine egne" on public.lesson_signoffs
  for select to authenticated using (
    private.is_member(school_id)
    or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
  );
create policy "Lærere kvitterer" on public.lesson_signoffs
  for insert to authenticated with check (instructor_id in (select private.my_instructor_ids()));
create policy "Eleven bekræfter, læreren kobler timen på" on public.lesson_signoffs
  for update to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
    or signed_by = (select auth.uid())
  )
  with check (
    exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid()))
    or signed_by = (select auth.uid())
  );
-- Ingen slette-regel: en kvittering kan aldrig slettes.

-- Elevens hemmelige QR-nøgle må ikke stå i ændringsloggen.
create or replace function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sensitive text[] := array[
    'phone', 'email', 'address', 'postal_code', 'city', 'birth_date',
    'next_of_kin_name', 'next_of_kin_relation', 'next_of_kin_phone', 'calendar_token', 'qr_token'
  ];
  ignored text[] := array['created_at', 'updated_at'];
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb := '{}';
  k text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k <> all (ignored) and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(
          k,
          case when k = any (sensitive) then to_jsonb('(ændret)'::text)
               else jsonb_build_object('old', v_old -> k, 'new', v_new -> k) end
        );
      end if;
    end loop;
    if v_changes = '{}' then
      return null;
    end if;
  else
    select coalesce(jsonb_object_agg(
             e.key,
             case when e.key = any (sensitive) then to_jsonb('(skjult)'::text) else e.value end
           ), '{}')
      into v_changes
      from jsonb_each(v_row) e
     where e.key <> all (ignored);
  end if;

  insert into public.audit_log (school_id, actor_id, action, table_name, record_id, summary, changes)
  values (
    case when tg_table_name = 'schools' then (v_row ->> 'id')::uuid else (v_row ->> 'school_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    nullif(current_setting('vixx.audit_summary', true), ''),
    v_changes
  );
  return null;
end;
$$;

create trigger write_audit after insert or update on public.lesson_signoffs
  for each row execute function private.write_audit();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
