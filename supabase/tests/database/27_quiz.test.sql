-- Quiz: private quizzer ses kun af ejeren; en runde startes af en lærer; gæster (uden login) og elever tilmelder
-- sig med kaldenavn og svarer én gang; point gives for rigtige svar; kun værten ser deltagerne.
-- Seed: Lars lærer (a100-…11), Pia lærer (a100-…14), Emil elev (a100-…31).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
reset role;

select * from finish();
rollback;
