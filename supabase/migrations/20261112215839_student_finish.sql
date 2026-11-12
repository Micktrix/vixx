-- Afslut elevens forløb (12. nov. 2026): fx bestået køreprøve. Eleven bliver inaktiv (kan ikke logge ind og
-- forsvinder fra lister), men intet slettes, så kvitteringer og lektioner kan findes til dokumentation.

create type public.finish_reason as enum ('passed', 'stopped', 'other');

alter table public.students
  add column finished_on date,
  add column finish_reason public.finish_reason,
  add column finish_note text check (char_length(finish_note) <= 300),
  -- En afsluttet elev er altid inaktiv; årsag og dato hører sammen.
  add constraint students_finish_check check (
    (finished_on is null and finish_reason is null and finish_note is null)
    or (finished_on is not null and finish_reason is not null and not active)
  );
