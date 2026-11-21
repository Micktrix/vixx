-- Ombygning 21. nov. 2026: enkel scanning. Teori scannes kun, når forløbet har "Teori registreres ved scanning";
-- ellers bekræfter den afsluttende lærer teorien (mindst minimum). Mørke-kravet er opfyldt, når 7.19 er bekræftet,
-- og mørkekørslen får en kopi af den kørende lærers underskrift. Scanning og afslutning gemmes i ét (alt eller
-- intet). Startdato for modul 1 = holdets startdato. EU er ikke et forløb for eleven. Kontoret vælger
-- undervisende kørelærere.
-- Seed: Emil og Freja er på C-holdet (start for 3 dage siden); Lars har gemt sin underskrift, Mette har ikke.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create temporary table ids as
select
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id
    where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 1) as c1,
  (select m.id from public.course_modules m join public.courses c on c.id = m.course_id
    where c.kind = 'C' and c.school_id = '00000000-0000-4000-a000-000000000001' and m.number = 2) as c2,
  (select id from public.courses where kind = 'EU' and school_id = '00000000-0000-4000-a000-000000000001') as eu;
grant select on ids to authenticated;

set local role authenticated;
-- Lars (lærer).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);

select throws_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c1, 'theory', 2, null, false, false, false, null, null, null, false) from ids$$,
  '23514', null, 'Teori kan ikke scannes på C (bekræftes ved afslutning)');
select throws_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c1, 'driving', 5, null, false, false, true, null, null, null, false) from ids$$,
  '23514', 'Skriv antal teorilektioner i modulet.', 'Afslutning på C kræver antal teorilektioner');
select is((select count(*) from public.module_signoffs where student_id = '00000000-0000-4000-ad00-000000000031'), 0::bigint,
  'En afslutning, der fejler, gemmer heller ikke kørslen (alt eller intet)');
select throws_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c1, 'driving', 5, null, false, false, true, 7, null, null, false) from ids$$,
  '23514', null, 'Teorien kan ikke være under minimum (8)');
select lives_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c1, 'driving', 5, E'7.9 Overhaling', false, false, true, 10, null, null, false) from ids$$,
  'Lars bekræfter 5 kørselslektioner og afslutter modul 1 med 10 teorilektioner i samme tryk');
select results_eq(
  $$select theory_lessons, extra_theory, extra_driving, started_on from public.module_completions
    where student_id = '00000000-0000-4000-ad00-000000000031'$$,
  $$values (10, 2, 0, current_date - 3)$$,
  'Teori og ekstra teori gemmes; modul 1 startede på holdets startdato');
select is((select skipped_items from public.module_signoffs where student_id = '00000000-0000-4000-ad00-000000000031'),
  '7.9 Overhaling', 'Køreemner, der ikke blev kørt, gemmes');

-- Mørke (C modul 2 har krav om kørsel i mørke).
select throws_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c2, 'driving', 5, null, false, false, true, 7, null, null, false) from ids$$,
  '23514', 'Mangler: kørsel i mørke (7.19).', 'Modulet kan ikke afsluttes uden kørsel i mørke (7.19)');
select lives_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c2, 'driving', 1, null, true, false, false, null, null, null, false) from ids$$,
  'Lars bekræfter kørsel i mørke');
select throws_ok(
  $$select dark_strokes from public.module_signoffs$$,
  '42501', null, 'Kopien af underskriften kan ikke læses via appen');
reset role;
select ok((select dark_strokes is not null from public.module_signoffs
  where student_id = '00000000-0000-4000-ad00-000000000031' and dark), 'Mørkekørslen har en kopi af Lars'' underskrift');
set local role authenticated;
select lives_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000031', c2, 'driving', 4, null, false, false, true, 7, null, null, false) from ids$$,
  'Med 7.19 bekræftet kan modul 2 afsluttes');

-- Mette har ingen underskrift: hun kan køre, men ikke bekræfte mørke.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000012", "role": "authenticated"}', true);
select throws_ok(
  $$select public.record_scan('00000000-0000-4000-ad00-000000000032', c2, 'driving', 1, null, true, false, false, null, null, null, false) from ids$$,
  '23514', null, 'Mørkekørsel kræver den kørende lærers gemte underskrift');

-- EU er ikke et forløb for eleven.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000002", "role": "authenticated"}', true);
select throws_ok(
  $$update public.students set course_id = (select eu from ids) where id = '00000000-0000-4000-ad00-000000000032'$$,
  '23514', null, 'EU vælges med fluebenet, ikke som forløb');

-- Undervisende kørelærere: kontoret vælger, læreren kan ikke.
select lives_ok(
  $$insert into public.plan_teachers (school_id, student_id, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', '00000000-0000-4000-a200-000000000012')$$,
  'Kontoret vælger en undervisende kørelærer på eleven uden hold');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a100-000000000011", "role": "authenticated"}', true);
select throws_ok(
  $$insert into public.plan_teachers (school_id, student_id, instructor_id)
    values ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-ad00-000000000033', '00000000-0000-4000-a200-000000000011')$$,
  '42501', null, 'Læreren kan ikke vælge undervisende kørelærere');
reset role;

select * from finish();
rollback;
