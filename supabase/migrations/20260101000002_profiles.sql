-- Profiles: one row per auth.users account, holding the public-facing
-- username. Kept separate from auth.users (which we do not own and cannot
-- put RLS on) so the rest of the schema has a `public` table to reference.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'Public profile for an auth.users account. Created by the signup server action right after auth.signUp succeeds.';

alter table public.profiles enable row level security;

-- Any signed-in user can look someone up by username to send a friend
-- request, or render a friend's name on a moment -- usernames are not
-- secret, unlike the moments/photos those friendships unlock.
create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "a user can create only their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "a user can update only their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
