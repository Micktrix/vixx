-- Lærerens digitale underskrift (aftalt 19. nov. 2026). Læreren tegner den én gang i lærer-appen, gemmer
-- og låser den; den kan låses op og tegnes om. Kun læreren selv kan se og rette den – heller ikke admin
-- eller kontor. Senere (trin E8) sætter Vixx den automatisk på modulplanen, når læreren afslutter et modul.
-- Underskriften gemmes som stregdata (SVG-stiens "d"), ikke som fri SVG, så der aldrig kan ligge kode i den.
create table public.instructor_signatures (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  strokes text not null check (length(strokes) between 10 and 60000 and strokes ~ '^[ML0-9 .-]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create trigger set_updated_at before update on public.instructor_signatures
  for each row execute function private.set_updated_at();

alter table public.instructor_signatures enable row level security;
revoke all on public.instructor_signatures from anon, authenticated;
grant select, insert, update, delete on public.instructor_signatures to authenticated;
grant all on public.instructor_signatures to service_role;

create policy "Kun læreren selv ser sin underskrift" on public.instructor_signatures
  for select to authenticated using (user_id = (select auth.uid()) and private.is_member(school_id));
create policy "Kun læreren selv gemmer sin underskrift" on public.instructor_signatures
  for insert to authenticated with check (user_id = (select auth.uid()) and private.is_member(school_id));
create policy "Kun læreren selv retter sin underskrift" on public.instructor_signatures
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_member(school_id))
  with check (user_id = (select auth.uid()) and private.is_member(school_id));
create policy "Kun læreren selv sletter sin underskrift" on public.instructor_signatures
  for delete to authenticated using (user_id = (select auth.uid()) and private.is_member(school_id));

-- Ændringsloggen skriver, at underskriften er gemt eller ændret, men aldrig selve stregerne.
create or replace function private.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sensitive text[] := array[
    'phone', 'email', 'address', 'postal_code', 'city', 'birth_date',
    'next_of_kin_name', 'next_of_kin_relation', 'next_of_kin_phone', 'calendar_token', 'qr_token', 'strokes'
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

create trigger write_audit after insert or update or delete on public.instructor_signatures
  for each row execute function private.write_audit();
