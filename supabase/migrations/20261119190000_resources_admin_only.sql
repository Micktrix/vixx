-- Lokaler og køretøjer oprettes, rettes og slettes kun af admin (aftalt 19. nov. 2026). Alle på skolen kan
-- stadig se dem og booke de ledige (bookingerne har deres egne regler).
drop policy "Kontoret opretter ressourcer" on public.resources;
drop policy "Kontoret retter ressourcer" on public.resources;
drop policy "Kontoret sletter ressourcer" on public.resources;

create policy "Admin opretter ressourcer" on public.resources
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter ressourcer" on public.resources
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));
create policy "Admin sletter ressourcer" on public.resources
  for delete to authenticated using (private.is_admin(school_id));
