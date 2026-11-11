-- Kalender i telefonen (11. nov. 2026). Hver lærer har et hemmeligt link til en kalenderfil (iCal), som
-- telefonens kalender abonnerer på. Linket er nøglen, så det kan skiftes ("Lav nyt link"), hvis en
-- telefon bliver væk. Kalenderfilen laves af serveren ud fra nøglen; den viser aldrig elevnavne.

alter table public.instructors
  add column calendar_token uuid not null default gen_random_uuid();

create unique index instructors_calendar_token_idx on public.instructors (calendar_token);

-- Linket er hemmeligt: ændringsloggen skriver kun, at det er ændret, ikke selve værdien.
create or replace function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sensitive text[] := array[
    'phone', 'email', 'address', 'postal_code', 'city', 'birth_date',
    'next_of_kin_name', 'next_of_kin_relation', 'next_of_kin_phone', 'calendar_token'
  ];
  ignored text[] := array['created_at', 'updated_at'];
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_changes jsonb := '{}';
  k text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k <> all (ignored) and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(
          k,
          case when k = any (sensitive) then to_jsonb('(ændret)'::text)
               else jsonb_build_object('old', v_old -> k, 'new', v_new -> k) end
        );
      end if;
    end loop;
    if v_changes = '{}' then
      return null;
    end if;
  else
    select coalesce(jsonb_object_agg(
             e.key,
             case when e.key = any (sensitive) then to_jsonb('(skjult)'::text) else e.value end
           ), '{}')
      into v_changes
      from jsonb_each(v_row) e
     where e.key <> all (ignored);
  end if;

  insert into public.audit_log (school_id, actor_id, action, table_name, record_id, summary, changes)
  values (
    case when tg_table_name = 'schools' then (v_row ->> 'id')::uuid else (v_row ->> 'school_id')::uuid end,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    nullif(current_setting('vixx.audit_summary', true), ''),
    v_changes
  );
  return null;
end;
$$;
