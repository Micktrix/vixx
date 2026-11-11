-- Backup af timer på e-mail. Hver nat sendes en CSV med registreringerne i den igangværende og den
-- forrige lønperiode (uden elevnavne og noter) til skolens backup-adresse.
-- Egen tabel, så kun admin kan se og rette adressen (lærerne kan se skolens række i "schools").

create table public.school_backups (
  school_id uuid primary key references public.schools (id) on delete cascade,
  email text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

alter table public.school_backups enable row level security;
revoke all on public.school_backups from anon, authenticated;
grant select, insert, update on public.school_backups to authenticated;
grant all on public.school_backups to service_role;

create policy "Admin ser backup-adressen" on public.school_backups
  for select to authenticated using (private.is_admin(school_id));
create policy "Admin opretter backup-adressen" on public.school_backups
  for insert to authenticated with check (private.is_admin(school_id));
create policy "Admin retter backup-adressen" on public.school_backups
  for update to authenticated using (private.is_admin(school_id)) with check (private.is_admin(school_id));

-- Kun ændringer af adressen logges, ikke den natlige afsendelse.
create trigger write_audit after insert or delete on public.school_backups
  for each row execute function private.write_audit();
create trigger write_audit_email after update on public.school_backups
  for each row when (old.email is distinct from new.email) execute function private.write_audit();
