-- Profiles: the half of an account that other people are allowed to see.
--
-- Supabase owns `auth.users` (email, OTP state, tokens). That table is not safe
-- to expose through the API and cannot carry application columns, so everything
-- roamr needs in order to *show* a person lives here instead, keyed 1:1 by the
-- same id.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Nullable on purpose. The row is created by a trigger the instant the
  -- account exists, but the person picks their name during onboarding. A
  -- NOT NULL column would force the trigger to invent one, and invented
  -- usernames stick around forever.
  --
  -- citext gives case-insensitive uniqueness, so "Mann" and "mann" cannot both
  -- be claimed by different people. citext is installed into the `extensions`
  -- schema (20260101000000_extensions.sql), which is not on the default
  -- search_path for migrations, so the type has to be referenced qualified.
  username extensions.citext unique,

  display_name text,
  avatar_path text,

  -- Friends-only is the product default, not an opt-out. Going public is
  -- something a person turns on deliberately.
  is_public boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The casts are explicit rather than relying on citext's implicit cast to
  -- text: a check constraint that silently resolves to a different operator
  -- than intended is not something a migration should leave to inference.
  constraint profiles_username_length
    check (char_length((username)::text) between 3 and 30),

  -- Lowercase only. citext already makes lookups case-insensitive; forbidding
  -- stored uppercase on top of that means a username has exactly one spelling,
  -- so URLs and @-mentions never disagree about which one is canonical.
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

-- Keep updated_at honest without every caller having to remember it. Named for
-- this table rather than a generic helper so that parallel feature branches
-- cannot collide on the function name.
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

-- Every account gets a profile row the moment it exists, so no other code path
-- ever has to cope with "signed in but has no profile". security definer is
-- required because the insert happens under the auth service's role, which has
-- no rights on public.profiles.
--
-- The explicit empty search_path is the point of the exercise: a security
-- definer function that resolves unqualified names through the caller's
-- search_path is a privilege-escalation vector, because the caller chooses
-- which schema `profiles` means.
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

-- Reading is open to any signed-in person, deliberately. Adding a friend means
-- typing their username, and that lookup has to resolve before the two of you
-- are friends -- there is no other entry point into the graph.
--
-- What that exposes is exactly the identity columns on this table: username,
-- display_name, avatar_path, is_public. It is not a hole in friends-only
-- visibility, because no content lives here. Moments, cities and trips are
-- gated by their own policies via public.are_friends().
create policy "profiles are readable by signed-in users"
  on public.profiles
  for select
  to authenticated
  using (true);

-- The `(select auth.uid())` wrapper is not cosmetic: it lets the planner treat
-- the call as an initplan evaluated once per statement instead of once per row.
create policy "people can update only their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policy by design. Rows appear via the auth.users trigger
-- and disappear via the on delete cascade, so there is no legitimate reason for
-- a client to do either, and no policy means no way to try.

grant select, update on table public.profiles to authenticated;

-- Anonymous visitors have no business here in v1. RLS already denies them (no
-- policy grants anon anything), but revoking the table privilege as well means
-- a future policy written without a `to` clause cannot accidentally open it.
revoke all on table public.profiles from anon;
