-- Lærernes private oplysninger (19. nov. 2026). Kontoret ser lærerlisten (kalenderen bruger den), men må
-- ikke kunne læse adresse, pårørende, e-mail, fødselsdato, ansættelsesdatoer eller det hemmelige
-- kalender-link. Tabellen kan derfor kun læses kolonne for kolonne; de private felter hentes med
-- instructor_private(), som kun svarer admin og læreren selv. Rettelser går stadig direkte i tabellen
-- (RLS og guard_instructor_self_update styrer hvem og hvad).

revoke select on public.instructors from anon, authenticated;
grant select (
  id, school_id, user_id, employee_number, is_guest, guest_company, active_until,
  availability, active, created_at, updated_at
) on public.instructors to authenticated;

create function public.instructor_private(p_instructor_id uuid)
returns table (
  email text,
  address text,
  postal_code text,
  city text,
  next_of_kin_name text,
  next_of_kin_relation text,
  next_of_kin_phone text,
  employed_from date,
  birth_date date,
  instructor_license_expires date,
  calendar_token uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.email, i.address, i.postal_code, i.city,
         i.next_of_kin_name, i.next_of_kin_relation, i.next_of_kin_phone,
         i.employed_from, i.birth_date, i.instructor_license_expires,
         -- Kalender-linket er kun lærerens eget.
         case when i.user_id = (select auth.uid()) then i.calendar_token end
  from public.instructors i
  where i.id = p_instructor_id
    and (private.is_admin(i.school_id) or i.user_id = (select auth.uid()));
$$;

revoke all on function public.instructor_private(uuid) from public, anon;
grant execute on function public.instructor_private(uuid) to authenticated;
