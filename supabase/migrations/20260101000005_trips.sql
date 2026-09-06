-- Trips: an optional, free-text user-named grouping of moments. Not a
-- canonical destination lookup (README's "option 1" decision) -- a trip can
-- span moments across multiple cities, so it has no city_id of its own.

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

comment on table public.trips is 'A free-text trip label a user can optionally attach moments to.';

alter table public.trips enable row level security;

create policy "a user can see their own trips or a friend's trips"
  on public.trips for select
  to authenticated
  using (user_id = (select auth.uid()) or public.are_friends((select auth.uid()), user_id));

create policy "a user can create only their own trips"
  on public.trips for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "a user can update only their own trips"
  on public.trips for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "a user can delete only their own trips"
  on public.trips for delete
  to authenticated
  using (user_id = (select auth.uid()));
