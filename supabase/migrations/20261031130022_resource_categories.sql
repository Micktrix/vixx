-- Lokaler og køretøjer:
-- * Et køretøj kan dække flere kategorier (fx en B-bil bruges også til BE).
-- * Et lokale bruges til en eller flere typer (fx Teori), så det tilbydes ved planlægning af de typer.
-- * Lokaler, køretøjer og typer kan slettes, hvis de ikke er brugt. Brugte kan kun slås fra.

create table public.resource_categories (
  school_id uuid not null,
  resource_id uuid not null,
  category_code text not null references public.license_categories (code),
  created_at timestamptz not null default now(),
  primary key (resource_id, category_code),
  foreign key (school_id, resource_id) references public.resources (school_id, id) on delete cascade
);
create index resource_categories_school_idx on public.resource_categories (school_id);

create table public.resource_lesson_types (
  school_id uuid not null,
  resource_id uuid not null,
  lesson_type_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (resource_id, lesson_type_id),
  foreign key (school_id, resource_id) references public.resources (school_id, id) on delete cascade,
  foreign key (school_id, lesson_type_id) references public.lesson_types (school_id, id) on delete cascade
);
create index resource_lesson_types_school_idx on public.resource_lesson_types (school_id);
create index resource_lesson_types_type_idx on public.resource_lesson_types (lesson_type_id);

-- Flyt køretøjernes ene kategori over, og giv eksisterende lokaler typen "Teori", hvis skolen har den.
insert into public.resource_categories (school_id, resource_id, category_code)
select school_id, id, vehicle_category_code from public.resources where vehicle_category_code is not null;

insert into public.resource_lesson_types (school_id, resource_id, lesson_type_id)
select r.school_id, r.id, t.id
from public.resources r
join public.lesson_types t on t.school_id = r.school_id and t.name = 'Teori'
where r.kind = 'room';

alter table public.resources drop column vehicle_category_code;

-- Adgang som lokaler og køretøjer: alle på skolen ser, kontoret ændrer.
alter table public.resource_categories enable row level security;
alter table public.resource_lesson_types enable row level security;
revoke all on public.resource_categories, public.resource_lesson_types from anon, authenticated;
grant select, insert, delete on public.resource_categories, public.resource_lesson_types to authenticated;
grant all on public.resource_categories, public.resource_lesson_types to service_role;

create policy "Medlemmer ser køretøjers kategorier" on public.resource_categories
  for select to authenticated using (private.is_member(school_id));
create policy "Kontoret tilføjer kategorier til køretøjer" on public.resource_categories
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret fjerner kategorier fra køretøjer" on public.resource_categories
  for delete to authenticated using (private.is_staff(school_id));

create policy "Medlemmer ser lokalers typer" on public.resource_lesson_types
  for select to authenticated using (private.is_member(school_id));
create policy "Kontoret tilføjer typer til lokaler" on public.resource_lesson_types
  for insert to authenticated with check (private.is_staff(school_id));
create policy "Kontoret fjerner typer fra lokaler" on public.resource_lesson_types
  for delete to authenticated using (private.is_staff(school_id));

create trigger write_audit after insert or update or delete on public.resource_categories
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.resource_lesson_types
  for each row execute function private.write_audit();

-- Et lokale/køretøj med bookinger kan ikke slettes (fremmednøglen ville ellers slette bookingerne med).
create function private.guard_resource_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.bookings b where b.resource_id = old.id) then
    raise exception '% har bookinger og kan kun slås fra.', old.name using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

create trigger guard_resource_delete before delete on public.resources
  for each row execute function private.guard_resource_delete();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
