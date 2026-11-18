-- Quiz (18. nov. 2026): lærere og kontor laver quizzer (private eller delt i vidensbankens mapper) og kører
-- dem live på storskærmen. Deltagerne scanner en QR-kode og svarer på telefonen med et kaldenavn – også gæster
-- uden login. Er deltageren logget ind som elev på skolen, gemmes resultatet på eleven.
-- Deltagernes handlinger går gennem funktionerne nederst (med en hemmelig nøgle pr. deltager), aldrig direkte
-- i tabellerne. Storskærmen viser kun kaldenavne.

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id),
  owner_name text not null default '',
  folder_id uuid,                                   -- tom = privat
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, folder_id) references public.material_folders (school_id, id)
);
create index quizzes_school_idx on public.quizzes (school_id);
create index quizzes_folder_idx on public.quizzes (folder_id);
create index quizzes_owner_idx on public.quizzes (owner_id);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  quiz_id uuid not null,
  position int not null default 0,
  text text not null check (char_length(btrim(text)) between 1 and 300),
  image_path text,                                  -- billede i fillageret "materials"
  answers text[] not null check (cardinality(answers) between 2 and 4),
  correct int not null,
  time_limit int not null default 20 check (time_limit between 5 and 120),
  created_at timestamptz not null default now(),
  foreign key (school_id, quiz_id) references public.quizzes (school_id, id) on delete cascade,
  check (correct between 0 and cardinality(answers) - 1)
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, position);

create type public.quiz_status as enum ('lobby', 'question', 'reveal', 'finished');

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  quiz_id uuid not null,
  host_id uuid not null default auth.uid() references auth.users (id),
  code text not null check (code ~ '^[0-9]{6}$'),
  status public.quiz_status not null default 'lobby',
  current_index int not null default -1,
  question_started_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  foreign key (school_id, quiz_id) references public.quizzes (school_id, id) on delete cascade
);
create unique index quiz_sessions_active_code_idx on public.quiz_sessions (code) where status <> 'finished';
create index quiz_sessions_quiz_idx on public.quiz_sessions (quiz_id);

create table public.quiz_players (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  session_id uuid not null,
  token uuid not null default gen_random_uuid() unique, -- deltagerens hemmelige nøgle (ligger kun i dennes browser)
  nickname text not null check (char_length(nickname) between 1 and 20),
  student_id uuid,                                  -- sat, hvis deltageren er logget ind som elev på skolen
  score int not null default 0,
  removed boolean not null default false,
  joined_at timestamptz not null default now(),
  foreign key (school_id, session_id) references public.quiz_sessions (school_id, id) on delete cascade,
  foreign key (school_id, student_id) references public.students (school_id, id) on delete set null (student_id)
);
create unique index quiz_players_nickname_idx on public.quiz_players (session_id, lower(nickname));
create index quiz_players_student_idx on public.quiz_players (student_id);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions (id) on delete cascade,
  player_id uuid not null references public.quiz_players (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  choice int not null,
  correct boolean not null,
  points int not null,
  answered_at timestamptz not null default now(),
  unique (player_id, question_id)
);
create index quiz_answers_session_idx on public.quiz_answers (session_id, question_id);

-- Ejer og navn sættes af databasen; kun åbne mapper kan modtage en quiz.
create function private.guard_quiz()
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
  elsif (new.school_id, new.owner_id, new.owner_name) is distinct from (old.school_id, old.owner_id, old.owner_name) then
    raise exception 'Quizzen kan ikke ændres sådan.' using errcode = 'insufficient_privilege';
  end if;
  if new.folder_id is not null and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
     and not exists (select 1 from public.material_folders f where f.id = new.folder_id and f.school_id = new.school_id and f.active) then
    raise exception 'Vælg en åben mappe.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger guard_quiz before insert or update on public.quizzes
  for each row execute function private.guard_quiz();
create trigger set_updated_at before update on public.quizzes
  for each row execute function private.set_updated_at();

-- Må brugeren se quizzen? (ejer, eller delt i en mappe på skolen)
create function private.can_see_quiz(p_quiz uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (q.owner_id = (select auth.uid()) or (q.folder_id is not null and private.is_member(q.school_id)))
  );
$$;

-- Må brugeren rette quizzen? (ejer, eller admin/kontor for en delt quiz)
create function private.can_edit_quiz(p_quiz uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (q.owner_id = (select auth.uid()) or (q.folder_id is not null and private.is_staff(q.school_id)))
  );
$$;

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_players enable row level security;
alter table public.quiz_answers enable row level security;
revoke all on public.quizzes, public.quiz_questions, public.quiz_sessions, public.quiz_players, public.quiz_answers from anon, authenticated;
grant select, insert, update, delete on public.quizzes, public.quiz_questions to authenticated;
grant select on public.quiz_sessions, public.quiz_players, public.quiz_answers to authenticated;
grant all on public.quizzes, public.quiz_questions, public.quiz_sessions, public.quiz_players, public.quiz_answers to service_role;

create policy "Egne og skolens quizzer" on public.quizzes
  for select to authenticated using (owner_id = (select auth.uid()) or (folder_id is not null and private.is_member(school_id)));
create policy "Lærere og kontor laver quizzer" on public.quizzes
  for insert to authenticated with check (private.is_member(school_id) and owner_id = (select auth.uid()));
create policy "Ejeren retter, admin og kontor rydder op" on public.quizzes
  for update to authenticated
  using (owner_id = (select auth.uid()) or (folder_id is not null and private.is_staff(school_id)))
  with check (private.is_member(school_id));
create policy "Ejeren sletter, admin og kontor rydder op" on public.quizzes
  for delete to authenticated using (owner_id = (select auth.uid()) or (folder_id is not null and private.is_staff(school_id)));

create policy "Spørgsmål til synlige quizzer" on public.quiz_questions
  for select to authenticated using (private.can_see_quiz(quiz_id));
create policy "Spørgsmål oprettes af den, der må rette quizzen" on public.quiz_questions
  for insert to authenticated with check (private.can_edit_quiz(quiz_id));
create policy "Spørgsmål rettes af den, der må rette quizzen" on public.quiz_questions
  for update to authenticated using (private.can_edit_quiz(quiz_id)) with check (private.can_edit_quiz(quiz_id));
create policy "Spørgsmål slettes af den, der må rette quizzen" on public.quiz_questions
  for delete to authenticated using (private.can_edit_quiz(quiz_id));

-- Kun værten (læreren, der kører quizzen) ser runden, deltagerne og svarene.
create policy "Værten ser sin runde" on public.quiz_sessions
  for select to authenticated using (host_id = (select auth.uid()));
create policy "Værten ser deltagerne" on public.quiz_players
  for select to authenticated using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.host_id = (select auth.uid())));
create policy "Værten ser svarene" on public.quiz_answers
  for select to authenticated using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.host_id = (select auth.uid())));
-- Eleven ser sine egne resultater.
create policy "Eleven ser sine egne deltagelser" on public.quiz_players
  for select to authenticated using (exists (select 1 from public.students st where st.id = student_id and st.user_id = (select auth.uid())));

create trigger write_audit after insert or update or delete on public.quizzes
  for each row execute function private.write_audit();

-- ---------------------------------------------------------------------------
-- Værten: start en runde og styr den.
-- ---------------------------------------------------------------------------
create function public.quiz_start(p_quiz uuid)
returns table (session_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_code text;
  v_id uuid;
begin
  select q.* into v_quiz from public.quizzes q where q.id = p_quiz;
  if v_quiz.id is null or not private.can_see_quiz(p_quiz) or not private.is_member(v_quiz.school_id) then
    raise exception 'Quizzen findes ikke.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.quiz_questions qq where qq.quiz_id = p_quiz) then
    raise exception 'Quizzen har ingen spørgsmål endnu.' using errcode = 'check_violation';
  end if;
  -- Gamle runder, der aldrig blev afsluttet, lukkes, så koderne kan genbruges.
  update public.quiz_sessions s set status = 'finished' where s.status <> 'finished' and s.created_at < now() - interval '8 hours';
  for i in 1 .. 20 loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    begin
      insert into public.quiz_sessions (school_id, quiz_id, host_id, code)
      values (v_quiz.school_id, p_quiz, (select auth.uid()), v_code) returning id into v_id;
      return query select v_id, v_code;
      return;
    exception when unique_violation then
      -- koden er i brug; prøv en ny
    end;
  end loop;
  raise exception 'Der kunne ikke laves en kode. Prøv igen.';
end;
$$;

-- 'next' (næste spørgsmål), 'reveal' (vis svaret), 'finish' (afslut) og 'remove' (fjern en deltager).
create function public.quiz_host(p_session uuid, p_action text, p_player uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.quiz_sessions;
  v_count int;
begin
  select s.* into v_session from public.quiz_sessions s where s.id = p_session and s.host_id = (select auth.uid());
  if v_session.id is null then
    raise exception 'Runden findes ikke.' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_count from public.quiz_questions q where q.quiz_id = v_session.quiz_id;
  if p_action = 'next' then
    if v_session.current_index + 1 >= v_count then
      update public.quiz_sessions set status = 'finished' where id = p_session;
    else
      update public.quiz_sessions
      set status = 'question', current_index = v_session.current_index + 1, question_started_at = now()
      where id = p_session;
    end if;
  elsif p_action = 'reveal' and v_session.status = 'question' then
    update public.quiz_sessions set status = 'reveal' where id = p_session;
  elsif p_action = 'finish' then
    update public.quiz_sessions set status = 'finished' where id = p_session;
  elsif p_action = 'remove' then
    update public.quiz_players set removed = true where id = p_player and session_id = p_session;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deltagerne (også uden login): tilmeld, se status og svar. Nøglen (token) kender kun deltagerens browser.
-- ---------------------------------------------------------------------------
create function public.quiz_join(p_code text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.quiz_sessions;
  v_nick text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_student uuid;
  v_token uuid;
begin
  select s.* into v_session from public.quiz_sessions s
  where s.code = btrim(p_code) and s.status <> 'finished' and s.created_at > now() - interval '8 hours';
  if v_session.id is null then
    raise exception 'Koden passer ikke til en quiz, der er i gang.' using errcode = 'check_violation';
  end if;
  if char_length(v_nick) not between 1 and 20 then
    raise exception 'Skriv et kaldenavn på højst 20 tegn.' using errcode = 'check_violation';
  end if;
  select st.id into v_student from public.students st
  where st.school_id = v_session.school_id and st.user_id = (select auth.uid()) and st.active;
  insert into public.quiz_players (school_id, session_id, nickname, student_id)
  values (v_session.school_id, v_session.id, v_nick, v_student)
  returning token into v_token;
  return v_token;
exception when unique_violation then
  raise exception 'Kaldenavnet er taget. Vælg et andet.' using errcode = 'unique_violation';
end;
$$;

-- Deltagerens skærm: status, spørgsmålet (uden det rigtige svar, indtil det vises) og egne point.
create function public.quiz_player_state(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_player public.quiz_players;
  v_session public.quiz_sessions;
  v_question public.quiz_questions;
  v_answer public.quiz_answers;
  v_total int;
  v_rank int;
begin
  select p.* into v_player from public.quiz_players p where p.token = p_token;
  if v_player.id is null then
    return null;
  end if;
  select s.* into v_session from public.quiz_sessions s where s.id = v_player.session_id;
  select count(*) into v_total from public.quiz_questions q where q.quiz_id = v_session.quiz_id;
  select q.* into v_question from public.quiz_questions q
  where q.quiz_id = v_session.quiz_id order by q.position, q.created_at offset greatest(v_session.current_index, 0) limit 1;
  select a.* into v_answer from public.quiz_answers a where a.player_id = v_player.id and a.question_id = v_question.id;
  select 1 + count(*) into v_rank from public.quiz_players p
  where p.session_id = v_player.session_id and not p.removed and p.score > v_player.score;
  return jsonb_build_object(
    'nickname', v_player.nickname,
    'removed', v_player.removed,
    'score', v_player.score,
    'rank', v_rank,
    'status', v_session.status,
    'index', v_session.current_index,
    'total', v_total,
    'question', case when v_session.status in ('question', 'reveal') then jsonb_build_object(
      'id', v_question.id,
      'text', v_question.text,
      'answers', to_jsonb(v_question.answers),
      'image_path', v_question.image_path,
      'seconds_left', greatest(0, v_question.time_limit - extract(epoch from now() - v_session.question_started_at))::int,
      'correct', case when v_session.status = 'reveal' then v_question.correct end
    ) end,
    'answered', v_answer.id is not null,
    'my_choice', v_answer.choice,
    'my_correct', case when v_session.status = 'reveal' then v_answer.correct end,
    'my_points', case when v_session.status = 'reveal' then v_answer.points end
  );
end;
$$;

-- Svar: kun mens spørgsmålet er åbent, én gang. Rigtigt svar giver 500 point plus op til 500 for hurtighed.
create function public.quiz_answer(p_token uuid, p_choice int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.quiz_players;
  v_session public.quiz_sessions;
  v_question public.quiz_questions;
  v_left numeric;
  v_correct boolean;
  v_points int;
begin
  select p.* into v_player from public.quiz_players p where p.token = p_token and not p.removed;
  if v_player.id is null then
    raise exception 'Du er ikke med i quizzen.' using errcode = 'insufficient_privilege';
  end if;
  select s.* into v_session from public.quiz_sessions s where s.id = v_player.session_id;
  if v_session.status <> 'question' then
    raise exception 'Spørgsmålet er lukket.' using errcode = 'check_violation';
  end if;
  select q.* into v_question from public.quiz_questions q
  where q.quiz_id = v_session.quiz_id order by q.position, q.created_at offset v_session.current_index limit 1;
  v_left := v_question.time_limit - extract(epoch from now() - v_session.question_started_at);
  if v_left < -1 then
    raise exception 'Tiden er gået.' using errcode = 'check_violation';
  end if;
  if p_choice not between 0 and cardinality(v_question.answers) - 1 then
    raise exception 'Vælg et af svarene.' using errcode = 'check_violation';
  end if;
  v_correct := p_choice = v_question.correct;
  v_points := case when v_correct then 500 + round(500 * greatest(v_left, 0) / v_question.time_limit) else 0 end;
  insert into public.quiz_answers (session_id, player_id, question_id, choice, correct, points)
  values (v_session.id, v_player.id, v_question.id, p_choice, v_correct, v_points);
  update public.quiz_players set score = score + v_points where id = v_player.id;
exception when unique_violation then
  raise exception 'Du har allerede svaret.' using errcode = 'unique_violation';
end;
$$;

revoke all on function public.quiz_start(uuid), public.quiz_host(uuid, text, uuid), public.quiz_join(text, text),
  public.quiz_player_state(uuid), public.quiz_answer(uuid, int) from public;
grant execute on function public.quiz_start(uuid), public.quiz_host(uuid, text, uuid) to authenticated;
grant execute on function public.quiz_join(text, text), public.quiz_player_state(uuid), public.quiz_answer(uuid, int) to anon, authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
