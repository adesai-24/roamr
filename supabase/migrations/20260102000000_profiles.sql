-- Profiles: the half of an account that other people are allowed to see.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Nullable on purpose.
  username extensions.citext unique,

  display_name text,
  avatar_path text,

  -- Friends-only is the product default, not an opt-out.
  is_public boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The casts are explicit rather than relying on citext's implicit cast to text.
  constraint profiles_username_length
    check (char_length((username)::text) between 3 and 30),

  -- Lowercase only.
  constraint profiles_username_format
    check ((username)::text ~ '^[a-z0-9_]+$')
);

comment on table public.profiles is
  'Public-facing account identity. One row per auth.users row, created by trigger.';
comment on column public.profiles.username is
  'Case-insensitively unique handle. Null until the person completes onboarding.';
comment on column public.profiles.avatar_path is
  'Storage object path, not a URL. Reads go through a server-minted signed URL.';
comment on column public.profiles.is_public is
  'Opt-in public profile. False means friends-only, which is the product default.';

-- Keep updated_at honest without every caller having to remember it.
create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

-- Every account gets a profile row the moment it exists.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;

-- Reading is open to any signed-in person, deliberately.
create policy "profiles are readable by signed-in users"
  on public.profiles
  for select
  to authenticated
  using (true);

-- The `(select auth.uid())` wrapper is not cosmetic.
create policy "people can update only their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policy by design.

grant select, update on table public.profiles to authenticated;

-- Anonymous visitors have no business here in v1.
revoke all on table public.profiles from anon;
