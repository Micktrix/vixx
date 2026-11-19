-- Quiz: private quizzer ses kun af ejeren; en runde startes af en lærer; gæster (uden login) og elever tilmelder
-- sig med kaldenavn og svarer én gang; point gives for rigtige svar; kun værten ser deltagerne.
-- Seed: Lars lærer (a100-…11), Pia lærer (a100-…14), Emil elev (a100-…31).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create temporary table ids (quiz uuid, session uuid, code text, guest uuid, emil uuid);
insert into ids values (null, null, null, null, null);
grant select, update on ids to authenticated, anon;

create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a100-0000000000' || p, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_user('11');
select lives_ok($$insert into public.quizzes (school_id, title) values ('00000000-0000-4000-a000-000000000001', 'Vigepligt')$$, 'Læreren laver en quiz');
update ids set quiz = (select id from public.quizzes where title = 'Vigepligt');
select lives_ok(
  $$insert into public.quiz_questions (school_id, quiz_id, text, answers, correct)
    select '00000000-0000-4000-a000-000000000001', quiz, 'Hvem har vigepligt?', array['Mig', 'Dig', 'Ingen'], 1 from ids$$,
  'Læreren tilføjer et spørgsmål');

select pg_temp.as_user('14');
select is((select count(*) from public.quizzes), 0::bigint, 'En anden lærer ser ikke en privat quiz');
select throws_ok($$select public.quiz_start((select quiz from ids))$$, '42501', null, 'En anden lærer kan ikke starte en privat quiz');

select pg_temp.as_user('11');
update ids set (session, code) = (select session_id, code from public.quiz_start((select quiz from ids)));
select ok((select code ~ '^[0-9]{6}$' from ids), 'Runden får en sekscifret kode');

-- En gæst uden login tilmelder sig.
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
update ids set guest = public.quiz_join((select code from ids), ' Turbo   Tine ');
select is((public.quiz_player_state((select guest from ids)) ->> 'nickname'), 'Turbo Tine', 'Gæsten er med med sit kaldenavn');
select throws_ok($$select public.quiz_join((select code from ids), 'turbo tine')$$, '23505', 'Kaldenavnet er taget. Vælg et andet.', 'Kaldenavne er unikke');
select throws_ok($$select public.quiz_answer((select guest from ids), 1)$$, '23514', 'Spørgsmålet er lukket.', 'Man kan ikke svare før spørgsmålet');

-- Emil er logget ind som elev; hans deltagelse kobles på ham.
set local role authenticated;
select pg_temp.as_user('31');
update ids set emil = public.quiz_join((select code from ids), 'EmilE');

-- Læreren viser første spørgsmål; gæsten svarer rigtigt, Emil forkert.
select pg_temp.as_user('11');
select public.quiz_host((select session from ids), 'next');
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select lives_ok($$select public.quiz_answer((select guest from ids), 1)$$, 'Gæsten svarer');
select throws_ok($$select public.quiz_answer((select guest from ids), 0)$$, '23505', 'Du har allerede svaret.', 'Man kan kun svare én gang');
select ok(((public.quiz_player_state((select guest from ids)) ->> 'score')::int) >= 500, 'Rigtigt svar giver point');
select is((public.quiz_player_state((select guest from ids)) -> 'question' ->> 'correct'), null, 'Det rigtige svar vises ikke, før læreren viser det');

set local role authenticated;
select pg_temp.as_user('11');
select is((select count(*) from public.quiz_players), 2::bigint, 'Værten ser deltagerne');
select pg_temp.as_user('14');
select is((select count(*) from public.quiz_players), 0::bigint, 'Andre ser ikke deltagerne');

-- Deling med flueben: ejeren deler, de andre lærere ser den, men kun ejeren og admin/kontor retter.
select pg_temp.as_user('11');
update public.quizzes set shared = true where id = (select quiz from ids);
select pg_temp.as_user('14');
select is((select count(*) from public.quizzes), 1::bigint, 'En delt quiz ses af de andre lærere');
select is((select count(*) from public.quiz_questions), 1::bigint, 'De andre lærere ser spørgsmålene i en delt quiz');
with u as (update public.quizzes set title = 'Kapret' where id = (select quiz from ids) returning 1)
select is((select count(*) from u), 0::bigint, 'En anden lærer kan ikke rette en delt quiz');
select pg_temp.as_user('02');
select throws_ok($$update public.quizzes set shared = false where id = (select quiz from ids)$$, '42501', null, 'Kun ejeren kan gøre quizzen privat');
select pg_temp.as_user('11');
update public.quizzes set shared = false where id = (select quiz from ids);
select pg_temp.as_user('14');
select is((select count(*) from public.quizzes), 0::bigint, 'Ejeren kan gøre quizzen privat igen');

-- Billeder på svar: kun filer fra samme quiz, og et svar skal have tekst eller billede.
select pg_temp.as_user('11');
select lives_ok(
  $$insert into public.quiz_questions (school_id, quiz_id, text, answers, answer_images, correct)
    select '00000000-0000-4000-a000-000000000001', quiz, 'Hvilken tavle viser motorvej?', array['', 'Ingen af dem'],
           array['00000000-0000-4000-a000-000000000001/quiz/' || quiz || '/tavle.png', ''], 0 from ids$$,
  'Et svar kan være et billede uden tekst');
select throws_ok(
  $$insert into public.quiz_questions (school_id, quiz_id, text, answers, answer_images, correct)
    select '00000000-0000-4000-a000-000000000001', quiz, 'Snyd', array['', 'B'],
           array['00000000-0000-4000-a000-000000000002/materials/hemmelig.pdf', ''], 0 from ids$$,
  '23514', 'Billedet hører ikke til denne quiz.', 'Et billede kan ikke pege på en anden skoles fil');
select throws_ok(
  $$insert into public.quiz_questions (school_id, quiz_id, text, answers, correct)
    select '00000000-0000-4000-a000-000000000001', quiz, 'Tomt', array['', 'B'], 0 from ids$$,
  '23514', 'Hvert svar skal have tekst eller et billede.', 'Et svar kan ikke være helt tomt');
reset role;

select * from finish();
rollback;
