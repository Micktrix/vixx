-- Skolens kørelektioner under modulerne (20. nov. 2026, aftalt med Michael).
-- Skolen kører efter sit eget lektionsskema (fx "Lektionsskema C + D"): hver kørelektion har nummer, længde
-- (antal × 45 min.), sted, punkter, kontrolstof og evt. kørsel i mørke. Lektionerne ligger under modulerne.
-- Ved scanning vælger læreren lektionen og krydser de punkter af, der IKKE blev kørt. Lektionen er gennemført
-- ved scanningen og tæller selv som kørsel i modulet (fx 2 × 45 min. = 2 kørselslektioner). Kun kørelektioner;
-- teori tælles som før. Punkter, der ikke er kørt, giver en advarsel ved afslutning af modulet, men stopper den ikke.
-- Elevens underskrift pr. lektion kommer senere (papir indtil da).

alter table public.course_modules add constraint course_modules_school_id_id_key unique (school_id, id);

create table public.module_lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  course_module_id uuid not null,
  sort_order int not null default 0,
  number text not null check (char_length(btrim(number)) between 1 and 20),   -- fx "2" eller "17"
  lesson_count int not null default 2 check (lesson_count between 1 and 8),  -- antal × 45 min.
  dark boolean not null default false,                                       -- kørsel i mørke
  location text check (char_length(location) <= 120),                       -- fx "Øvelsesstrækning"
  content text check (char_length(content) <= 4000),                         -- punkter, ét pr. linje
  notes text check (char_length(notes) <= 1000),                             -- fx "Samt repetition fra lektion 4"
  control_topic text check (char_length(control_topic) <= 200),              -- kontrolstof
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, course_module_id) references public.course_modules (school_id, id) on delete cascade
);
create index module_lessons_module_idx on public.module_lessons (course_module_id, sort_order);
create index module_lessons_school_idx on public.module_lessons (school_id);

alter table public.module_lessons enable row level security;
revoke all on public.module_lessons from anon, authenticated;
grant select, insert, update, delete on public.module_lessons to authenticated;
grant all on public.module_lessons to service_role;

create policy "Medlemmer ser modulernes lektioner" on public.module_lessons
  for select to authenticated using (private.is_member(school_id));
create policy "Eleven ser lektionerne i sit eget forløb" on public.module_lessons
  for select to authenticated using (
    exists (select 1 from public.course_modules m where m.id = course_module_id and private.is_own_course(m.course_id)));
create policy "Admin opretter lektioner" on public.module_lessons
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter lektioner" on public.module_lessons
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter lektioner" on public.module_lessons
  for delete to authenticated using (private.is_admin(school_id));

create trigger set_updated_at before update on public.module_lessons
  for each row execute function private.set_updated_at();
create trigger write_audit after insert or update or delete on public.module_lessons
  for each row execute function private.write_audit();

-- En tælling kan være en gennemført lektion: modul, kørsel, antal og mørke kommer fra lektionen, og
-- punkterne, der ikke blev kørt, gemmes. En lektion gennemføres én gang pr. elev; en brugt lektion kan ikke slettes.
alter table public.module_signoffs
  add column module_lesson_id uuid references public.module_lessons (id),
  add column skipped_items text check (char_length(skipped_items) <= 4000);   -- punkter, der ikke blev kørt
create unique index module_signoffs_one_per_lesson on public.module_signoffs (student_id, module_lesson_id)
  where module_lesson_id is not null;
create index module_signoffs_lesson_idx on public.module_signoffs (module_lesson_id);

create function private.apply_module_lesson()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lesson public.module_lessons;
begin
  if new.module_lesson_id is null then
    new.skipped_items := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.module_lesson_id is distinct from old.module_lesson_id then
    raise exception 'En gennemført lektion kan ikke flyttes til en anden lektion.' using errcode = 'check_violation';
  end if;
  select * into v_lesson from public.module_lessons where id = new.module_lesson_id;
  if v_lesson.id is null or (tg_op = 'INSERT' and not v_lesson.active) then
    raise exception 'Lektionen findes ikke.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.course_module_id := v_lesson.course_module_id;
    new.kind := 'driving';
    new.lesson_count := v_lesson.lesson_count;
    new.dark := v_lesson.dark;
  end if;
  new.skipped_items := nullif(btrim(new.skipped_items), '');
  return new;
end;
$$;

-- Kører før de andre regler på tællingen (alfabetisk: apply_ < block_ < check_ < guard_).
create trigger apply_module_lesson before insert or update on public.module_signoffs
  for each row execute function private.apply_module_lesson();

revoke all on function private.apply_module_lesson() from public, anon;
grant execute on function private.apply_module_lesson() to authenticated, service_role;

-- Skolens lektionsskema for C og D ("Lektionsskema C + D", Trafikskolen) som skabelon. Modulerne er Vixx'
-- forslag (skemaet siger det ikke): modul 1 = lektion 2, 4, 6; modul 2 = 9, 11, 12 (mørke); modul 3 = 13, 17, 18.
-- Admin kan flytte og rette lektionerne bagefter. Kører som den, der kalder (RLS): kun admin.
create function public.add_lesson_schedule(p_course_id uuid, p_template text)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_template is distinct from 'CD-skema' then
    raise exception 'Ukendt lektionsskema: %', p_template using errcode = '22023';
  end if;
  insert into public.module_lessons (school_id, course_module_id, sort_order, number, lesson_count, dark, location, content, notes, control_topic)
  select m.school_id, m.id, l.sort_order, l.number, l.lesson_count, l.dark, l.location, l.content, l.notes, l.control_topic
  from (values
    (1, 10, '2', 2, false, 'Øvelsesstrækning (øvelsesplads/fabriksområde el. lign.)',
     E'2.1 Forberedelse til kørsel\n2.2 Lastbilens spejle\n2.3 Igangsætning og standsning ved kørebanekant\n2.4 Forlæns og baglæns højresving om hjørner\n2.5 Baglæns kørsel med målbremsning',
     null, 'Bremser og styretøj'),
    (1, 20, '4', 2, false, 'Øvelsesstrækning',
     E'1.1–1.6 Stikprøvevis kontrol mv. af køretøjets udstyr\n7.1 Igangsætning og standsning v. kantsten\n7.2 Placering under ligeudkørsel\n7.3 Hastighed under ligeudkørsel\n7.4 Vognbaneskift og sammenfletning\n7.5 Vending og baglænskørsel\n7.13 Højresving i mindre trafikerede kryds\n7.14 Venstresving i mindre trafikerede kryds\n7.15 Kørsel i rundkørsel\n7.6 Kørsel forbi holdende (repetition fra kategori B)\n7.7 Møde (repetition fra kategori B)\n7.8 Kørsel foran eller efter andre (repetition fra kategori B)\n7.11 Fremkørsel mod kryds (repetition fra kategori B)\n7.12 Ligeudkørsel i kryds (repetition fra kategori B)',
     null, 'Lygter og bærende dele'),
    (1, 30, '6', 2, false, 'Øvelsesstrækning',
     E'1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr\n7.2 Placering under ligeudkørsel\n7.3 Hastighed under ligeudkørsel\n7.6 Kørsel forbi holdende køretøjer, gående mv.\n7.7 Møde\n7.8 Kørsel foran eller efter andre\n7.9 Overhaling',
     'Samt repetition fra lektion 4', 'Motor og karosseri'),
    (2, 10, '9', 2, false, 'Øvelsesstrækning',
     E'1.1–1.7 Stikprøvevis kontrol af køretøjets udstyr\n7.3 Landevejskørsel\n7.9 Overhaling\n7.15 Kørsel i (større) rundkørsler\n7.16 Kørsel på motorvej/(motortrafikvej)\n7.20 Kørsel i tunnel\n7.21 Kørsel ved letbane',
     null, 'Vægttavler'),
    (2, 20, '11', 2, false, 'Øvelsesstrækning',
     E'Stikprøvevis kontrol mv. af køretøjets udstyr\n7.17 Kørsel ved siden af andre (tæt trafik)\n7.11 Fremkørsel mod kryds (repetition)\n7.12 Ligeudkørsel i kryds (repetition)\n7.13 Højresving i kryds (repetition)\n7.14 Venstresving i kryds (repetition)\n7.15 Kørsel i rundkørsel, mindre (repetition)\n7.18 Standsning og parkering (repetition)',
     null, 'Repetition af kontrolstof'),
    (2, 30, '12', 1, true, 'Øvelsesstrækning',
     E'1.1–1.7 Stikprøvevis kontrol\n7.19 Kørsel i mørke',
     null, null),
    (3, 10, '13', 1, false, 'Øvelsesstrækning',
     E'1.1–1.5 Stikprøvevis kontrol mv. af køretøjets udstyr\n7.1–7.18 Repetition af foregående manøvrer',
     null, null),
    (3, 20, '17', 1, false, 'Fri øvelsesstrækning',
     E'Evaluerende praktisk prøve\nRepetition og forberedelse til praktisk prøve\n7.2–7.18 Repetition af foregående manøvrer\n1.1–1.7 Stikprøvevis kontrol mv. af køretøjets udstyr',
     'Lektion 17–18 kan køres som én køreperiode (2 × 45 min.) eller som to.', null),
    (3, 30, '18', 1, false, 'Fri øvelsesstrækning',
     E'Sidste kørsel inden aflæggelse af praktisk prøve, herunder stikprøvevis kontrol af køretøjets udstyr\n7.2–7.18 Repetition af foregående manøvrer',
     'Lektion 17–18 kan køres som én køreperiode (2 × 45 min.) eller som to.', 'Repetition af kontrolstof')
  ) l (module_number, sort_order, number, lesson_count, dark, location, content, notes, control_topic)
  join public.course_modules m on m.course_id = p_course_id and m.number = l.module_number;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.add_lesson_schedule(uuid, text) from public, anon;
grant execute on function public.add_lesson_schedule(uuid, text) to authenticated, service_role;
