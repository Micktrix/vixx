-- Ydelsernes rækkefølge og klynger (11. nov. 2026). Admin bestemmer rækkefølgen i dropdown, så de mest
-- brugte ligger øverst, og kan sætte en streg efter en ydelse, så de står i klynger (fx dag og aften).

alter table public.services
  add column sort_order int not null default 0,
  add column break_after boolean not null default false;

-- Eksisterende ydelser står i navneorden som før.
update public.services s
set sort_order = o.n * 10
from (select id, row_number() over (partition by school_id order by name) as n from public.services) o
where o.id = s.id;

create index services_school_order_idx on public.services (school_id, sort_order);
