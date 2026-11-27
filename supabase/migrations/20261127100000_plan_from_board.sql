-- Trin E11 (Michael 27. nov. 2026): planlæg fra holdtavlen. Et tryk på en manglende lektion (1–9, KTA) eller
-- EU-køretime lægger en planlagt lektion i lærerens (og elevens) kalender. Den er adskilt fra lønnen: den har ingen
-- ydelse, og læreren registrerer stadig selv sine timer. Holdtavlen viser den som planlagt (gul med dato).
-- KTA og EU-ture køres ofte med flere elever: har læreren samme lektion på samme tid, sættes eleven på den.

alter table public.scheduled_lessons alter column service_id drop not null;
alter table public.scheduled_lessons
  add column school_lesson_id uuid references public.school_lessons (id) on delete set null,
  add column eu_topic_id uuid references public.eu_topics (id) on delete set null;
create index scheduled_lessons_school_lesson_idx on public.scheduled_lessons (school_lesson_id);
create index scheduled_lessons_eu_topic_idx on public.scheduled_lessons (eu_topic_id);

-- Kun planlagte lektioner fra holdtavlen (med en lektion eller EU-køretime) må være uden ydelse.
alter table public.scheduled_lessons add constraint scheduled_lessons_service_or_plan
  check (service_id is not null or school_lesson_id is not null or eu_topic_id is not null);

-- Ydelsen tjekkes kun, når der er en.
create or replace function private.guard_scheduled_lesson()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conflict text;
begin
  perform private.require_planning_access(new.school_id, new.instructor_id, new.origin = 'office');
  -- Appens brugere kan kun vælge ydelser i brug (seed/server må lægge alt ind).
  if current_user = 'authenticated' and new.service_id is not null and (
    tg_op = 'INSERT'
    or new.instructor_id is distinct from old.instructor_id
    or new.service_id is distinct from old.service_id
    or new.lesson_date is distinct from old.lesson_date) then
    perform private.check_service(new.school_id, new.instructor_id, new.service_id, new.lesson_date);
  end if;

  if tg_op = 'INSERT'
     or new.instructor_id is distinct from old.instructor_id
     or new.lesson_date is distinct from old.lesson_date
     or new.start_time is distinct from old.start_time
     or new.span_minutes is distinct from old.span_minutes then
    perform private.lock_instructor(new.instructor_id);
    v_conflict := private.instructor_conflict(
      new.instructor_id,
      private.time_span(new.lesson_date, new.start_time, new.span_minutes),
      new.id, null
    );
    if v_conflict is not null then
      raise exception '%', v_conflict using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;
