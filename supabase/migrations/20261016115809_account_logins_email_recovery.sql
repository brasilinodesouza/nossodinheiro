-- Usernames are immutable identifiers. Email stays in auth.users and is never
-- exposed to anonymous callers or other household members.
create table public.account_logins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  constraint valid_account_username check (
    char_length(username) between 3 and 32
    and username = lower(trim(username))
    and username ~ '^[a-z0-9][a-z0-9._-]*$'
  )
);
alter table public.account_logins enable row level security;
revoke all on public.account_logins from public, anon, authenticated;
grant select on public.account_logins to authenticated;
grant all on public.account_logins to service_role;
create policy account_login_own_read on public.account_logins
for select to authenticated using (user_id = (select auth.uid()));

-- Preserve every existing username and UUID; financial memberships are untouched.
insert into public.account_logins (user_id, username)
select id, convert_from(decode(split_part(email, '@', 1), 'hex'), 'UTF8')
from auth.users
where email ~ '^([a-f0-9]{2}){3,32}@usuarios[.]nossodinheiro[.]invalid$';

-- This internal trigger runs during Auth signup, before a session exists.
-- It is not an RPC and cannot be executed by app users.
create function private.register_account_login() returns trigger
language plpgsql security definer set search_path = '' as $$
declare account_username text;
begin
  if new.email ~ '^([a-f0-9]{2}){3,32}@usuarios[.]nossodinheiro[.]invalid$' then
    account_username := pg_catalog.convert_from(pg_catalog.decode(pg_catalog.split_part(new.email, '@', 1), 'hex'), 'UTF8');
  else
    account_username := pg_catalog.lower(pg_catalog.btrim(new.raw_user_meta_data ->> 'username'));
  end if;
  if account_username is null or char_length(account_username) not between 3 and 32
    or account_username !~ '^[a-z0-9][a-z0-9._-]*$' then
    raise exception 'Informe um login válido.';
  end if;
  insert into public.account_logins (user_id, username) values (new.id, account_username);
  return new;
end $$;
revoke all on function private.register_account_login() from public, anon, authenticated;
create trigger register_account_login after insert on auth.users
for each row execute function private.register_account_login();
