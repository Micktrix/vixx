-- Elevdelen (12. nov. 2026): admin kan rette en kvittering, der er givet for den forkerte lektion, ved at
-- flytte den til den lektion, der faktisk blev kørt (også efter elevens bekræftelse). Kun admin, ikke
-- lærere eller kontoret. Kvitteringen kan stadig aldrig slettes, og rettelsen står i ændringsloggen.

create or replace function private.guard_lesson_signoff()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number text;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.instructor_id is null then
      -- Admins afkrydsning: altid med kommentar, ikke frem i tiden og uden registrering til lønnen.
      if not private.is_admin(new.school_id) then
        raise exception 'Kun admin kan krydse en lektion af.' using errcode = 'insufficient_privilege';
      end if;
      if coalesce(btrim(new.comment), '') = '' then
        raise exception 'Skriv en kommentar, fx hvem der kørte lektionen.' using errcode = 'check_violation';
      end if;
      if new.lesson_date is null or new.lesson_date > private.today_dk() then
        raise exception 'Datoen kan ikke ligge frem i tiden.' using errcode = 'check_violation';
      end if;
      new.registration_id := null;
      new.confirmed_at := now();
    else
      if new.instructor_id not in (select private.my_instructor_ids()) then
        raise exception 'Du kan kun kvittere som dig selv.' using errcode = 'insufficient_privilege';
      end if;
      new.lesson_date := private.today_dk();
      new.confirmed_at := null;
      new.comment := null;
    end if;
    select l.number into v_number
    from private.student_course_lesson(new.student_id, new.course_lesson_id, new.school_id) l;
    if v_number is null then
      raise exception 'Lektionen hører ikke til elevens forløb.' using errcode = 'check_violation';
    end if;
    new.lesson_number := v_number;
    new.signed_by := (select auth.uid());
    new.instructor_name := coalesce((select p.full_name from public.profiles p where p.id = (select auth.uid())), '');
    new.signed_at := now();
    return new;
  end if;

  -- UPDATE: admin flytter kvitteringen til en anden lektion i elevens forløb; eleven bekræfter; læreren,
  -- der kvitterede, kobler registreringen på. Intet andet kan ændres.
  if new.course_lesson_id is distinct from old.course_lesson_id then
    if not private.is_admin(old.school_id) then
      raise exception 'Kun admin kan rette lektionen på en kvittering.' using errcode = 'insufficient_privilege';
    end if;
    select l.number into v_number
    from private.student_course_lesson(old.student_id, new.course_lesson_id, old.school_id) l;
    if v_number is null then
      raise exception 'Lektionen hører ikke til elevens forløb.' using errcode = 'check_violation';
    end if;
    new.lesson_number := v_number;
  elsif new.lesson_number is distinct from old.lesson_number then
    raise exception 'En kvittering kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  if (new.school_id, new.student_id, new.instructor_id, new.signed_by,
      new.instructor_name, new.signed_at, new.lesson_date, new.skipped_items, new.comment)
     is distinct from
     (old.school_id, old.student_id, old.instructor_id, old.signed_by,
      old.instructor_name, old.signed_at, old.lesson_date, old.skipped_items, old.comment) then
    raise exception 'En kvittering kan ikke ændres.' using errcode = 'insufficient_privilege';
  end if;
  if new.confirmed_at is distinct from old.confirmed_at then
    if old.confirmed_at is not null or not exists (
      select 1 from public.students s where s.id = new.student_id and s.user_id = (select auth.uid())
    ) then
      raise exception 'Kun eleven kan bekræfte lektionen, og kun én gang.' using errcode = 'insufficient_privilege';
    end if;
    new.confirmed_at := now();
  end if;
  if new.registration_id is distinct from old.registration_id and old.signed_by <> (select auth.uid()) then
    raise exception 'Kun læreren, der kvitterede, kan koble timen på.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create policy "Admin retter lektionen på en kvittering" on public.lesson_signoffs
  for update to authenticated
  using (private.is_admin(school_id))
  with check (private.is_admin(school_id));

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
