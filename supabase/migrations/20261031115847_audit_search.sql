-- Trin 9: søgning i ændringsloggen.
-- Kører som den kaldende bruger, så RLS gælder: kun kontoret ser skolens log.
-- Søgeteksten matcher ændringerne, personen der ændrede, og læreren ændringen handler om.

create function public.search_audit(
  p_school uuid,
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_before bigint default null,
  p_limit int default 100
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  action text,
  table_name text,
  record_id uuid,
  changes jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
           btrim(coalesce(p_query, '')) = '' as everything
  ),
  -- Lærere, hvis navn matcher søgningen (så "Lars" finder ændringer på Lars' lektioner).
  named as (
    select i.id as instructor_id, i.user_id
    from public.instructors i
    join public.profiles pr on pr.id = i.user_id
    cross join q
    where i.school_id = p_school and not q.everything and pr.full_name ilike q.pattern
  )
  select a.id, a.occurred_at, a.actor_id, p.full_name, a.action, a.table_name, a.record_id, a.changes
  from public.audit_log a
  left join public.profiles p on p.id = a.actor_id
  cross join q
  where a.school_id = p_school
    and (p_from is null or a.occurred_at >= (p_from::timestamp at time zone 'Europe/Copenhagen'))
    and (p_to is null or a.occurred_at < ((p_to + 1)::timestamp at time zone 'Europe/Copenhagen'))
    and (p_before is null or a.id < p_before)
    and (
      q.everything
      or a.changes::text ilike q.pattern
      or p.full_name ilike q.pattern
      or exists (
        select 1 from named n
        where a.record_id in (n.instructor_id, n.user_id)
           or a.changes::text like '%' || n.instructor_id::text || '%'
      )
    )
  order by a.id desc
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.search_audit(uuid, text, date, date, bigint, int) from public, anon;
grant execute on function public.search_audit(uuid, text, date, date, bigint, int) to authenticated, service_role;
