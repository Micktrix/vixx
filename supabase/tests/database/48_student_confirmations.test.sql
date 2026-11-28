-- Elevens underskrift og bekræftelser (28. nov. 2026): eleven skriver under én gang og bekræfter scanninger; "det
-- passer ikke" giver læreren besked. Underskriften kan ikke læses via API'et, og kun eleven selv kan svare.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- To kørte lektioner for Emil (C), scannet af Lars.
insert into public.lesson_signoffs (school_id, student_id, school_lesson_id, instructor_id)
select '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000031', l.id, '00000000-0000-4000-a200-000000000011'
from public.school_lessons l join public.students s on s.course_id = l.course_id
where s.id = '00000000-0000-4000-ad00-000000000031' and l.number in (1, 2);

-- Eleven Emil.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000031", "role": "authenticated"}', true);

select is((select count(*)::int from public.student_to_confirm('00000000-0000-4000-a000-000000000001') where kind = 'lesson'), 2,
  'Eleven ser de to kørte lektioner, der venter på bekræftelse');
select throws_ok(
  $$select public.student_confirm('00000000-0000-4000-a000-000000000001', (select array_agg(id) from public.student_to_confirm('00000000-0000-4000-a000-000000000001') where kind = 'lesson'), null, null)$$,
  '23514', null, 'Uden underskrift kan eleven ikke bekræfte');
select lives_ok(
  $$select public.student_save_signature('00000000-0000-4000-a000-000000000001', 'M 10 10 L 50 40 L 90 20 L 120 60')$$,
  'Eleven gemmer sin underskrift');
select is(
  (select public.student_confirm('00000000-0000-4000-a000-000000000001',
     (select array_agg(id) from public.student_to_confirm('00000000-0000-4000-a000-000000000001') where kind = 'lesson' and title like 'Lektion 1%'), null, null)),
  1, 'Eleven bekræfter lektion 1');
select lives_ok(
  $$select public.student_dispute('00000000-0000-4000-a000-000000000001', 'lesson',
     (select id from public.student_to_confirm('00000000-0000-4000-a000-000000000001') where kind = 'lesson' limit 1), 'Vi kørte ikke den dag')$$,
  'Eleven svarer "det passer ikke" på lektion 2');
select is((select count(*)::int from public.student_to_confirm('00000000-0000-4000-a000-000000000001') where kind = 'lesson'), 0,
  'Begge lektioner er besvaret');
select throws_ok($$select strokes from public.student_confirmations$$, '42501', null, 'Underskriften kan ikke læses via API''et');

-- Læreren Lars kan ikke bekræfte på elevens vegne, men har fået besked om "det passer ikke".
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$select public.student_confirm('00000000-0000-4000-a000-000000000001', (select array_agg(id) from public.lesson_signoffs), null, null)$$,
  '42501', null, 'En lærer kan ikke bekræfte på elevens vegne');
select ok((select count(*) from public.messages where body like '%Vi kørte ikke den dag%') = 1, 'Læreren har fået besked');

select * from finish();
rollback;
