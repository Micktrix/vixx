-- Quiz-deling med flueben: "Del med de andre lærere" (shared) i stedet for at vælge en mappe.
-- Gamle quizzer, der lå i en mappe, bliver delte.
alter table public.quizzes add column shared boolean not null default false;
update public.quizzes set shared = true where folder_id is not null;

-- Kun ejeren kan gøre en delt quiz privat igen (admin/kontor kan rette og rydde op, men ikke skjule).
create function private.guard_quiz_shared()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.shared and not new.shared and old.owner_id is distinct from (select auth.uid())
     and (select auth.uid()) is not null then
    raise exception 'Kun ejeren kan gøre quizzen privat.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger guard_quiz_shared before update on public.quizzes
  for each row execute function private.guard_quiz_shared();

create or replace function private.can_see_quiz(p_quiz uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (q.owner_id = (select auth.uid()) or (q.shared and private.is_member(q.school_id)))
  );
$$;

create or replace function private.can_edit_quiz(p_quiz uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quizzes q
    where q.id = p_quiz and (q.owner_id = (select auth.uid()) or (q.shared and private.is_staff(q.school_id)))
  );
$$;

drop policy "Egne og skolens quizzer" on public.quizzes;
create policy "Egne og skolens quizzer" on public.quizzes
  for select to authenticated using (owner_id = (select auth.uid()) or (shared and private.is_member(school_id)));

drop policy "Ejeren retter, admin og kontor rydder op" on public.quizzes;
create policy "Ejeren retter, admin og kontor rydder op" on public.quizzes
  for update to authenticated
  using (owner_id = (select auth.uid()) or (shared and private.is_staff(school_id)))
  with check (private.is_member(school_id));

drop policy "Ejeren sletter, admin og kontor rydder op" on public.quizzes;
create policy "Ejeren sletter, admin og kontor rydder op" on public.quizzes
  for delete to authenticated using (owner_id = (select auth.uid()) or (shared and private.is_staff(school_id)));
