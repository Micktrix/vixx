-- Aftaler på eleven (Michael, 21. nov. 2026): KTA, mørkekørsel, teoriprøve og køreprøve med dato, klokkeslæt og
-- adresse. Blandes IKKE med lærernes skema eller timer. Lærere og kontor skriver dem ind og ser dem; eleven ser
-- sine egne i appen. Faktaboksen på eleven: grå = intet, gul = booket, grøn = gennemført/bestået.
-- Ikke bestået gemmes (historik), og en ny aftale starter forfra (booket → bestået).

create type public.appointment_kind as enum ('kta', 'dark', 'theory_test', 'driving_test');
create type public.appointment_status as enum ('booked', 'passed', 'failed');

create table public.student_appointments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  kind public.appointment_kind not null,
  on_date date not null,
  at_time time,
  address text check (address is null or length(address) <= 200),
  status public.appointment_status not null default 'booked',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, student_id) references public.students (school_id, id) on delete cascade
);
create index student_appointments_student_idx on public.student_appointments (student_id, kind, on_date);
create index student_appointments_school_idx on public.student_appointments (school_id);

alter table public.student_appointments enable row level security;
revoke all on public.student_appointments from anon, authenticated;
grant select, insert, update, delete on public.student_appointments to authenticated;
grant all on public.student_appointments to service_role;

create policy "Skolen ser aftaler, eleven sine egne" on public.student_appointments
  for select to authenticated using (
    private.is_member(school_id)
    or student_id in (select s.id from public.students s where s.user_id = (select auth.uid()) and s.active)
  );
create policy "Lærere og kontor opretter aftaler" on public.student_appointments
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Lærere og kontor retter aftaler" on public.student_appointments
  for update to authenticated using (private.is_staff(school_id)) with check (private.is_staff(school_id));
-- Kun en booket aftale kan slettes (fx tastet forkert). Bestået og ikke bestået er historik.
create policy "Lærere og kontor sletter bookede aftaler" on public.student_appointments
  for delete to authenticated using (private.is_staff(school_id) and status = 'booked');

-- Et udfald (bestået / ikke bestået) kan ikke ændres bagefter, og eleven kan ikke flyttes.
create function private.guard_appointment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.address := nullif(btrim(new.address), '');
  if tg_op = 'UPDATE' then
    if new.student_id <> old.student_id or new.school_id <> old.school_id or new.kind <> old.kind then
      raise exception 'En aftale kan ikke flyttes til en anden elev eller type.' using errcode = 'check_violation';
    end if;
    if old.status <> 'booked' and current_user = 'authenticated' then
      raise exception 'Udfaldet er gemt og kan ikke ændres. Opret en ny aftale.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  if new.status <> 'booked' and new.on_date > private.today_dk() then
    raise exception 'En aftale frem i tiden kan ikke være gennemført endnu.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_appointment() from public, anon;
grant execute on function private.guard_appointment() to authenticated, service_role;

create trigger guard_appointment before insert or update on public.student_appointments
  for each row execute function private.guard_appointment();
create trigger write_audit after insert or update or delete on public.student_appointments
  for each row execute function private.write_audit();
