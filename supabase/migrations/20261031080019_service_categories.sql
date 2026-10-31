-- En ydelse kan dække flere kategorier (fx "Amu C/CE"), så der er færre ydelser at vælge imellem.
-- Prisen er én pr. ydelse. En lektion gemmer ydelsen, ikke kategorien.
-- En brugt ydelse kan få flere kategorier, men ikke miste nogen.

create table public.service_categories (
  school_id uuid not null,
  service_id uuid not null,
  category_code text not null references public.license_categories (code),
  created_at timestamptz not null default now(),
  primary key (service_id, category_code),
  foreign key (school_id, service_id) references public.services (school_id, id) on delete cascade
);
create index service_categories_school_id_idx on public.service_categories (school_id);
create index service_categories_category_idx on public.service_categories (category_code);

insert into public.service_categories (school_id, service_id, category_code)
select school_id, id, category_code from public.services;

-- Kategori-vagten flyttes til den nye tabel; ydelsens egen vagt gælder nu kun typen.
create or replace function private.guard_service_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.lesson_type_id is distinct from old.lesson_type_id and private.service_is_used(old.id) then
    raise exception 'Ydelsen er brugt på lektioner, så typen kan ikke ændres. Opret en ny ydelse og slå denne fra.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter table public.services drop column category_code;

-- Fjern kategori: ikke hvis ydelsen er brugt, og aldrig den sidste. (Sletning af hele ydelsen er tilladt.)
create function private.guard_service_category_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.services s where s.id = old.service_id) then
    return old;
  end if;
  if private.service_is_used(old.service_id) then
    raise exception 'Ydelsen er brugt på lektioner, så kategorien % kan ikke fjernes.', old.category_code
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.service_categories c
    where c.service_id = old.service_id and c.category_code <> old.category_code
  ) then
    raise exception 'En ydelse skal have mindst én kategori.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger guard_service_category_delete before delete on public.service_categories
  for each row execute function private.guard_service_category_delete();

-- Adgang som ydelser: alle på skolen ser, kun admin ændrer.
alter table public.service_categories enable row level security;
revoke all on public.service_categories from anon, authenticated;
grant select, insert, delete on public.service_categories to authenticated;
grant all on public.service_categories to service_role;

create policy "Medlemmer ser ydelsers kategorier" on public.service_categories
  for select to authenticated using (private.is_member(school_id));
create policy "Admin tilføjer kategorier til ydelser" on public.service_categories
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin fjerner kategorier fra ydelser" on public.service_categories
  for delete to authenticated using (private.is_admin(school_id));

create trigger write_audit after insert or update or delete on public.service_categories
  for each row execute function private.write_audit();
