-- Alle lærere har kontorets adgang (Michael, 21. nov. 2026): der er kun begrænsninger på det, der er admins.
-- "Kontor" (is_staff) omfatter nu også lærerrollen (en aktiv lærer, se has_role). Admin-delene bruger is_admin
-- og er uændrede.

create or replace function private.is_staff(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role(p_school, array['admin', 'office', 'instructor']::public.app_role[]);
$$;

-- Er den kaldende bruger kontor (nu også lærer) på en skole, hvor p_user er medlem?
create or replace function private.is_staff_for_person(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.school_members target
    where target.user_id = p_user
      and private.is_staff(target.school_id)
  );
$$;

revoke all on function private.is_staff(uuid), private.is_staff_for_person(uuid) from public, anon;
grant execute on function private.is_staff(uuid), private.is_staff_for_person(uuid) to authenticated, service_role;
