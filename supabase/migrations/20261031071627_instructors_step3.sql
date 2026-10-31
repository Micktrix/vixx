-- Trin 3: undervisere og roller.
-- En person kan have flere roller på samme skole:
--   school_members.role  = adgang til kontoret ('admin' eller 'office'), eller 'instructor' for kun lærer.
--   instructors.active   = personen har rollen lærer (rækken bevares, når rollen fjernes, så historik og løn bliver).
-- En lærer med "aktiv til" i fortiden (gæst) mister lærerrollen; er personen kun lærer, mister de al adgang.
-- Nye skoler får standardtyper, som admin selv kan rette.

alter table public.instructors add column active boolean not null default true;

create function private.today_dk()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Copenhagen')::date;
$$;

-- Er lærerrollen aktiv for denne række? (slået til og ikke udløbet)
create function private.instructor_is_active(p_active boolean, p_until date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_active and (p_until is null or p_until >= private.today_dk());
$$;

create or replace function private.has_role(p_school uuid, p_roles public.app_role[])
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
      and (
        m.role <> 'instructor'
        or exists (
          select 1 from public.instructors i
          where i.school_id = m.school_id
            and i.user_id = m.user_id
            and private.instructor_is_active(i.active, i.active_until)
        )
      )
  );
$$;

-- is_member skal også gælde kontorbrugere, der underviser; det gør den allerede via has_role.

create or replace function private.my_instructor_ids()
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
    and m.active
    and private.instructor_is_active(i.active, i.active_until);
$$;

revoke all on function private.today_dk() from public, anon;
revoke all on function private.instructor_is_active(boolean, date) from public, anon;
grant execute on function private.today_dk() to authenticated, service_role;
grant execute on function private.instructor_is_active(boolean, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Standardtyper
-- ---------------------------------------------------------------------------
create function private.add_default_lesson_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lesson_types (school_id, name, sort_order)
  select new.id, t.name, t.sort_order
  from (values
    ('Kørsel', 10), ('Teori', 20), ('Manøvre', 30),
    ('Glatbane', 40), ('Køreprøve', 50), ('Rybners', 60)
  ) t(name, sort_order)
  on conflict (school_id, name) do nothing;
  return new;
end;
$$;

revoke all on function private.add_default_lesson_types() from public, anon, authenticated;

create trigger add_default_lesson_types after insert on public.schools
  for each row execute function private.add_default_lesson_types();

-- Eksisterende skoler uden typer (fx testskolen i skyen).
insert into public.lesson_types (school_id, name, sort_order)
select s.id, t.name, t.sort_order
from public.schools s
cross join (values
  ('Kørsel', 10), ('Teori', 20), ('Manøvre', 30),
  ('Glatbane', 40), ('Køreprøve', 50), ('Rybners', 60)
) t(name, sort_order)
where not exists (select 1 from public.lesson_types lt where lt.school_id = s.id);
