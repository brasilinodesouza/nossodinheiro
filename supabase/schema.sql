-- Referência para um banco novo e vazio. Em produção use as migrações.
begin;
-- Execute uma vez no SQL Editor de um projeto Supabase dedicado ao app.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null unique references auth.users(id),
  partner_id uuid unique references auth.users(id),
  invitation_hash text,
  invitation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (partner_id is null or partner_id <> owner_id)
);

create table public.finance_states (
  household_id uuid primary key references public.households(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 2000000),
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.finance_states enable row level security;
revoke all on public.households, public.finance_states from anon, authenticated;
grant select (id, name, owner_id, partner_id) on public.households to authenticated;
grant select on public.finance_states to authenticated;
grant update (state, version, updated_at) on public.finance_states to authenticated;

create policy household_members_read on public.households for select to authenticated
using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));

create policy finance_members_read on public.finance_states for select to authenticated
using (exists (select 1 from public.households h where h.id = household_id and (h.owner_id = (select auth.uid()) or h.partner_id = (select auth.uid()))));

create policy finance_members_update on public.finance_states for update to authenticated
using (exists (select 1 from public.households h where h.id = household_id and (h.owner_id = (select auth.uid()) or h.partner_id = (select auth.uid()))))
with check (exists (select 1 from public.households h where h.id = household_id and (h.owner_id = (select auth.uid()) or h.partner_id = (select auth.uid()))));

-- Funções privilegiadas ficam fora do schema exposto à API.
-- Cada função valida o usuário; nenhuma usa user_metadata para autorização.
create function private.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); new_id uuid;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  if exists (select 1 from public.households where owner_id = actor or partner_id = actor) then
    raise exception 'Você já faz parte de um espaço.';
  end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'Informe um nome válido.'; end if;
  insert into public.households (name, owner_id) values (trim(p_name), actor) returning id into new_id;
  insert into public.finance_states (household_id) values (new_id);
  return new_id;
end $$;

create function private.create_invitation(p_household_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); token text;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  token := replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  update public.households
  set invitation_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex'),
      invitation_expires_at = now() + interval '7 days'
  where id = p_household_id and owner_id = actor and partner_id is null;
  if not found then raise exception 'Somente o criador de um espaço com vaga pode gerar um convite.'; end if;
  return token;
end $$;

create function private.join_household(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); joined_id uuid;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  if exists (select 1 from public.households where owner_id = actor or partner_id = actor) then
    raise exception 'Você já faz parte de um espaço.';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Convite inválido ou expirado.'; end if;
  update public.households
  set partner_id = actor, invitation_hash = null, invitation_expires_at = null
  where invitation_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
    and invitation_expires_at > now() and partner_id is null and owner_id <> actor
  returning id into joined_id;
  if joined_id is null then raise exception 'Convite inválido, utilizado ou expirado.'; end if;
  return joined_id;
end $$;

revoke all on function private.create_household(text), private.create_invitation(uuid), private.join_household(text) from public, anon;
grant execute on function private.create_household(text), private.create_invitation(uuid), private.join_household(text) to authenticated;

create function public.create_household(p_name text) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_household(p_name); $$;
create function public.create_invitation(p_household_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.create_invitation(p_household_id); $$;
create function public.join_household(p_token text) returns uuid
language sql security invoker set search_path = '' as $$ select private.join_household(p_token); $$;

create function public.save_finance_state(p_household_id uuid, p_expected_version integer, p_state jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare new_version integer;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para continuar.'; end if;
  update public.finance_states set state = p_state, version = version + 1, updated_at = now()
  where household_id = p_household_id and version = p_expected_version
  returning version into new_version;
  return new_version;
end $$;

revoke all on function public.create_household(text), public.create_invitation(uuid), public.join_household(text), public.save_finance_state(uuid, integer, jsonb) from public, anon;
grant execute on function public.create_household(text), public.create_invitation(uuid), public.join_household(text), public.save_finance_state(uuid, integer, jsonb) to authenticated;

-- Migrate existing couples without changing their financial document.
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null unique references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
alter table public.household_members enable row level security;
revoke all on public.household_members from public, anon, authenticated;
grant select (household_id, user_id) on public.household_members to authenticated;
create policy member_own_read on public.household_members for select to authenticated
using (user_id = (select auth.uid()));

insert into public.household_members (household_id, user_id)
select id, owner_id from public.households
union all
select id, partner_id from public.households where partner_id is not null;

create unique index households_invitation_hash_idx on public.households (invitation_hash)
where invitation_hash is not null;

drop policy household_members_read on public.households;
create policy household_members_read on public.households for select to authenticated
using (id in (select household_id from public.household_members where user_id = (select auth.uid())));
drop policy finance_members_read on public.finance_states;
create policy finance_members_read on public.finance_states for select to authenticated
using (household_id in (select household_id from public.household_members where user_id = (select auth.uid())));
drop policy finance_members_update on public.finance_states;
create policy finance_members_update on public.finance_states for update to authenticated
using (household_id in (select household_id from public.household_members where user_id = (select auth.uid())))
with check (household_id in (select household_id from public.household_members where user_id = (select auth.uid())));

create or replace function private.create_household(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); new_id uuid;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  if exists (select 1 from public.household_members where user_id = actor) then
    raise exception 'Você já faz parte de um espaço.';
  end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then raise exception 'Informe um nome válido.'; end if;
  insert into public.households (name, owner_id) values (trim(p_name), actor) returning id into new_id;
  insert into public.household_members (household_id, user_id) values (new_id, actor);
  insert into public.finance_states (household_id) values (new_id);
  return new_id;
end $$;

create or replace function private.create_invitation(p_household_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); token text;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if not exists (select 1 from public.household_members where household_id = p_household_id and user_id = actor) then
    raise exception 'Você não participa deste espaço.';
  end if;
  token := replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  update public.households
  set invitation_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(token, 'UTF8')), 'hex'),
      invitation_expires_at = now() + interval '7 days'
  where id = p_household_id;
  if not found then raise exception 'Espaço não encontrado.'; end if;
  return token;
end $$;

create or replace function private.join_household(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); joined_id uuid; current_id uuid;
begin
  if actor is null then raise exception 'Entre na sua conta para continuar.'; end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Convite inválido ou expirado.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  select id into joined_id from public.households
  where invitation_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
    and invitation_expires_at > now()
  for update;
  if joined_id is null then raise exception 'Convite inválido ou expirado.'; end if;
  select household_id into current_id from public.household_members where user_id = actor;
  if current_id = joined_id then return joined_id; end if;
  if current_id is not null then raise exception 'Você já faz parte de outro espaço.'; end if;
  insert into public.household_members (household_id, user_id) values (joined_id, actor);
  -- Keep the first partner for compatibility with older deployed clients.
  update public.households set partner_id = actor
  where id = joined_id and partner_id is null and owner_id <> actor;
  return joined_id;
end $$;

create function private.household_member_count(p_household_id uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members where household_id = p_household_id and user_id = auth.uid()
  ) then raise exception 'Você não participa deste espaço.'; end if;
  return (select count(*)::integer from public.household_members where household_id = p_household_id);
end $$;
revoke all on function private.household_member_count(uuid) from public, anon;
grant execute on function private.household_member_count(uuid) to authenticated;
create function public.household_member_count(p_household_id uuid) returns integer
language sql security invoker set search_path = '' as $$ select private.household_member_count(p_household_id); $$;
revoke all on function public.household_member_count(uuid) from public, anon;
grant execute on function public.household_member_count(uuid) to authenticated;

commit;
