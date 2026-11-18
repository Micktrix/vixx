-- Vidensbank / materialer (18. nov. 2026).
-- - "Mine materialer": private for den, der har lagt dem op (folder_id er tom).
-- - "Skolens materialer": i mapper, som kun admin opretter, omdøber, flytter og lukker (fx B, C/E, Taxa med
--   undermapper). Alle lærere og kontor på skolen kan se og downloade dem og lægge materiale i dem.
-- - Man retter og sletter sit eget; admin og kontor kan rydde op i skolens mapper.
-- Filerne ligger i Storage-bucketten "materials", som kun serveren tilgår (upload og download via
-- tidsbegrænsede links, efter at databasen har afgjort adgangen her). Elever har ingen adgang.

create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, parent_id) references public.material_folders (school_id, id)
);
create index material_folders_school_idx on public.material_folders (school_id);
create index material_folders_parent_idx on public.material_folders (parent_id);
create unique index material_folders_name_idx on public.material_folders (school_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'), lower(name));

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id),
  owner_name text not null default '',
  folder_id uuid,                                   -- tom = privat ("Mine materialer")
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (char_length(description) <= 500),
  kind text not null check (kind in ('file', 'link')),
  url text check (url ~* '^https?://' and char_length(url) <= 1000),
  storage_path text unique,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes between 0 and 52428800),
  ready boolean not null default false,            -- filen er lagt op (links er altid klar)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, folder_id) references public.material_folders (school_id, id),
  check ((kind = 'link' and url is not null and storage_path is null) or (kind = 'file' and url is null and storage_path is not null))
);
create index materials_school_idx on public.materials (school_id);
create index materials_folder_idx on public.materials (folder_id);
create index materials_owner_idx on public.materials (owner_id);

-- Mapper: højst to niveauer (mappe og undermappe), og en mappe med indhold kan kun lukkes, ikke slettes.
create function private.guard_material_folder()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.materials m where m.folder_id = old.id)
       or exists (select 1 from public.material_folders f where f.parent_id = old.id) then
      raise exception 'Mappen har indhold og kan kun lukkes, ikke slettes.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'En mappe kan ikke ligge i sig selv.' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.material_folders p where p.id = new.parent_id and p.parent_id is not null)
       or exists (select 1 from public.material_folders c where c.parent_id = new.id) then
      raise exception 'Mapper kan kun have ét niveau af undermapper.' using errcode = 'check_violation';
    end if;
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger guard_material_folder before insert or update or delete on public.material_folders
  for each row execute function private.guard_material_folder();
create trigger set_updated_at before update on public.material_folders
  for each row execute function private.set_updated_at();

-- Materialer: ejer og navn sættes af databasen. Kun åbne mapper kan modtage materiale. Andre end ejeren
-- (admin og kontor) kan kun flytte og omdøbe et delt materiale, ikke gøre det privat for sig selv.
create function private.guard_material()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := (select auth.uid());
    new.owner_name := coalesce((select p.full_name from public.profiles p where p.id = new.owner_id), '');
    new.ready := new.kind = 'link';
  else
    if (new.school_id, new.owner_id, new.owner_name, new.kind, new.storage_path, new.created_at)
       is distinct from (old.school_id, old.owner_id, old.owner_name, old.kind, old.storage_path, old.created_at) then
      raise exception 'Materialet kan ikke ændres sådan.' using errcode = 'insufficient_privilege';
    end if;
    if old.owner_id <> (select auth.uid()) and new.folder_id is null then
      raise exception 'Kun ejeren kan gøre et materiale privat.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.folder_id is not null and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
     and not exists (select 1 from public.material_folders f where f.id = new.folder_id and f.school_id = new.school_id and f.active) then
    raise exception 'Vælg en åben mappe.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_material before insert or update on public.materials
  for each row execute function private.guard_material();
create trigger set_updated_at before update on public.materials
  for each row execute function private.set_updated_at();

alter table public.material_folders enable row level security;
alter table public.materials enable row level security;
revoke all on public.material_folders, public.materials from anon, authenticated;
grant select, insert, update, delete on public.material_folders, public.materials to authenticated;
grant all on public.material_folders, public.materials to service_role;

create policy "Skolen ser mapperne" on public.material_folders
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter mapper" on public.material_folders
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter mapper" on public.material_folders
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter tomme mapper" on public.material_folders
  for delete to authenticated using (private.is_admin(school_id));

create policy "Egne og skolens materialer" on public.materials
  for select to authenticated using (
    owner_id = (select auth.uid()) or (folder_id is not null and private.is_member(school_id))
  );
create policy "Lærere og kontor lægger materiale op" on public.materials
  for insert to authenticated with check (private.is_member(school_id) and owner_id = (select auth.uid()));
create policy "Ejeren retter, admin og kontor rydder op" on public.materials
  for update to authenticated
  using (owner_id = (select auth.uid()) or (folder_id is not null and private.is_staff(school_id)))
  with check (private.is_member(school_id));
create policy "Ejeren sletter, admin og kontor rydder op" on public.materials
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (folder_id is not null and private.is_staff(school_id)));

create trigger write_audit after insert or update or delete on public.material_folders
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.materials
  for each row execute function private.write_audit();

-- Fillageret: privat bucket, kun serveren (service role) læser og skriver. Højst 50 MB pr. fil.
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800)
on conflict (id) do nothing;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
