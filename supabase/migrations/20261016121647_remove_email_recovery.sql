-- Email recovery was deferred. Keep the applied migration history, but remove
-- the unused registry and signup trigger without changing Auth or finance data.
-- Stop rather than orphaning a login if an email-based account appeared since
-- the feature was disabled.
do $$
begin
  if exists (
    select 1 from auth.users
    where email is not null
      and email !~ '^([a-f0-9]{2}){3,32}@usuarios[.]nossodinheiro[.]invalid$'
  ) then
    raise exception 'Existem contas com e-mail real. Preserve seus logins antes de remover o registro.';
  end if;
end $$;

drop trigger if exists register_account_login on auth.users;
drop function if exists private.register_account_login();
drop table if exists public.account_logins;
