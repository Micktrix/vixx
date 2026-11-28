-- Mørkekørsel uden for lektionsplanens tider (Michael 28. nov. 2026): mørkelektionen køres om aftenen, så den må
-- starte på et hvilket som helst kvarter, ikke kun skolens starttider. Det gælder den planlagte mørkelektion
-- (holdtavlen/"Planlæg undervisning"/"Ret lektion") og lærerens "Til løn" på den (registreringen har lektionens
-- starttid). Alt andet følger stadig lektionsplanen. Lektionerne fortsætter uden pause uden for planen.
create or replace function private.fill_lesson_span()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_starts time[];
  v_free boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.start_time is not distinct from old.start_time
     and new.lesson_count is not distinct from old.lesson_count
     and new.lesson_minutes is not distinct from old.lesson_minutes
     and old.span_minutes is not null then
    new.span_minutes := old.span_minutes;
    return new;
  end if;

  select s.lesson_starts into v_starts from public.schools s where s.id = new.school_id;
  if current_user = 'authenticated'
     and (tg_op = 'INSERT' or new.start_time is distinct from old.start_time)
     and not (new.start_time = any (v_starts)) then
    -- Undtagelsen for mørke: på et kvarter (hh:00, :15, :30, :45).
    if extract(minute from new.start_time)::int % 15 = 0 and extract(second from new.start_time) = 0 then
      if tg_table_name = 'scheduled_lessons' then
        v_free := exists (select 1 from public.school_lessons sl
                          where sl.id = (to_jsonb(new) ->> 'school_lesson_id')::uuid and sl.kind = 'dark');
      elsif tg_table_name = 'registrations' then
        v_free := exists (select 1 from public.scheduled_lessons l
                          join public.school_lessons sl on sl.id = l.school_lesson_id and sl.kind = 'dark'
                          where l.id = (to_jsonb(new) ->> 'scheduled_lesson_id')::uuid and l.start_time = new.start_time);
      end if;
    end if;
    if not v_free then
      raise exception 'Vælg en af skolens starttider (%).',
        (select string_agg(to_char(t, 'HH24:MI'), ', ') from unnest(v_starts) t)
        using errcode = 'check_violation';
    end if;
  end if;
  new.span_minutes := private.lesson_span(v_starts, new.start_time, new.lesson_count, new.lesson_minutes);
  return new;
end;
$$;
