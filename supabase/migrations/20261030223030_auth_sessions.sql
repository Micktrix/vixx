-- Trin 2: sessioner.
-- "Log ud af alle enheder" sletter brugerens sessioner. Adgangstokens er gyldige til de udløber,
-- så appen tjekker også ved hver side, at den aktuelle session stadig findes.

-- Er den kaldende brugers session stadig aktiv? Kan kun svare for brugeren selv.
create function public.session_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid
      and s.user_id = (select auth.uid())
  );
$$;

revoke all on function public.session_is_active() from public, anon;
grant execute on function public.session_is_active() to authenticated;

-- Logger en bruger ud af alle enheder. Kun serveren (service_role) må kalde den;
-- serveren tjekker forinden, at den indloggede kontorbruger har ret til det.
create function public.revoke_user_sessions(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
