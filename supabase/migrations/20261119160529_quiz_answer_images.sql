-- Billeder på svarene (19. nov. 2026): fx "Hvilken tavle viser motorvej?" med fire tavler som svar.
-- answer_images har ét element pr. svar; '' betyder intet billede. Et svar skal have tekst eller billede.
alter table public.quiz_questions add column answer_images text[];
alter table public.quiz_questions add constraint quiz_questions_answer_images_check
  check (answer_images is null or cardinality(answer_images) = cardinality(answers));

-- Billeder må kun pege på filer, der er lagt op til netop denne quiz (serveren laver links til dem).
-- Et svar uden tekst skal have et billede.
create function private.guard_quiz_question()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefix text := new.school_id::text || '/quiz/' || new.quiz_id::text || '/';
  i int;
begin
  if new.image_path is not null and left(new.image_path, length(v_prefix)) <> v_prefix then
    raise exception 'Billedet hører ikke til denne quiz.' using errcode = 'check_violation';
  end if;
  for i in 1 .. cardinality(new.answers) loop
    if coalesce(new.answer_images[i], '') <> '' and left(new.answer_images[i], length(v_prefix)) <> v_prefix then
      raise exception 'Billedet hører ikke til denne quiz.' using errcode = 'check_violation';
    end if;
    if btrim(new.answers[i]) = '' and coalesce(new.answer_images[i], '') = '' then
      raise exception 'Hvert svar skal have tekst eller et billede.' using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end;
$$;

create trigger guard_quiz_question before insert or update on public.quiz_questions
  for each row execute function private.guard_quiz_question();

-- Deltagerne får også svarenes billeder.
create or replace function public.quiz_player_state(p_token uuid)
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
      'answer_images', to_jsonb(coalesce(v_question.answer_images, array[]::text[])),
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
