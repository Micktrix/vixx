-- Elevdelen, trin E1: forløb (12. nov. 2026).
-- Et forløb hører til en kørekortkategori (B, C, D …) og består af lektioner i rækkefølge, som på
-- lektionsplanen på papir: nummer, længde (antal × 45 min.), type (kørsel/teori), sted, indhold (punkter),
-- noter og kontrolstof. Admin bygger og retter selv forløbene; alle på skolen kan se dem.
-- (Kvitteringer kommer i trin E3; de gemmer lektionens nummer og titel, så en senere rettelse ikke ændrer
-- en elevs historik, og en brugt lektion kan kun slås fra.)

create type public.course_lesson_kind as enum ('driving', 'theory');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  category_code text not null references public.license_categories (code),
  name text not null check (char_length(name) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (school_id, id)
);
create index courses_category_idx on public.courses (category_code);

create table public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_id uuid not null,
  sort_order int not null default 0,
  number text not null check (char_length(number) between 1 and 20),   -- fx "4" eller "17"
  kind public.course_lesson_kind not null default 'driving',
  lesson_count int not null default 2 check (lesson_count between 1 and 20),
  location text check (char_length(location) <= 80),                    -- fx "Øvelsesstrækning"
  content text check (char_length(content) <= 4000),                    -- én linje pr. punkt, fx "7.1 Igangsætning …"
  notes text check (char_length(notes) <= 1000),                        -- fx "Samt repetition fra lektion 4"
  control_topic text check (char_length(control_topic) <= 200),         -- kontrolstof, fx "Bremser og styretøj"
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (school_id, course_id) references public.courses (school_id, id) on delete cascade
);
create index course_lessons_course_idx on public.course_lessons (course_id, sort_order);
create index course_lessons_school_idx on public.course_lessons (school_id);

alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
revoke all on public.courses, public.course_lessons from anon, authenticated;
grant select, insert, update, delete on public.courses, public.course_lessons to authenticated;
grant all on public.courses, public.course_lessons to service_role;

create policy "Medlemmer ser forløb" on public.courses
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter forløb" on public.courses
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter forløb" on public.courses
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter forløb" on public.courses
  for delete to authenticated using (private.is_admin(school_id));

create policy "Medlemmer ser forløbets lektioner" on public.course_lessons
  for select to authenticated using (private.is_member(school_id));
create policy "Admin opretter lektioner i forløb" on public.course_lessons
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter lektioner i forløb" on public.course_lessons
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter lektioner i forløb" on public.course_lessons
  for delete to authenticated using (private.is_admin(school_id));

create trigger write_audit after insert or update or delete on public.courses
  for each row execute function private.write_audit();
create trigger write_audit after insert or update or delete on public.course_lessons
  for each row execute function private.write_audit();
